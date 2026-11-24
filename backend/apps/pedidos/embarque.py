"""Embarque das notas (2026-11-24, pedido da TI/chefia).

O Senior registra o embarque em E145EBQ (número, placa, motorista, saída, fechamento) e as
notas dele em E145NFV. O beat `apps.senior.tasks.sincronizar_embarques` lê os embarques
recentes e este módulo aplica no documento do Separa — a NF documento ou o pedido já
faturado (`Pedido.identificacao_nf`):

  - Conferido → **Embarcado** (o caminho normal);
  - Pendente e Selecionado → **Embarcado** também: a nota saiu do galpão sem passar pela
    conferência, não faz sentido continuar nas filas de Vendas e do Pátio
    (`status_anterior` diz de onde veio; "sem conferência" = não veio de Conferido);
  - Atribuído, Em conferência, Aguardando fechamento e Não conforme **não mudam sozinhos**
    (alguém está com o documento na mão ou precisa decidir): só ganham os dados do embarque,
    que as telas mostram como "nota já embarcada". Quando o documento chegar a Conferido
    (ou voltar a Selecionado), a passada seguinte o leva para Embarcado.

Se a nota sair do embarque no Senior (lançada no embarque errado), `desfazer` devolve o
documento à situação anterior. Nada é apagado: volumes, quantidades, sequência e conferente
ficam como estavam.
"""
import datetime as dt
import logging

from django.db import transaction
from django.utils import timezone

from .models import Pedido, PedidoLog, Sequencia

logger = logging.getLogger(__name__)

# Viram Embarcado quando a nota entra num embarque.
STATUS_VIRAM_EMBARCADO = (
    Pedido.Status.PENDENTE,
    Pedido.Status.SELECIONADO,
    Pedido.Status.CONFERIDO,
)
# Só ganham o aviso "nota já embarcada"; a situação fica.
STATUS_SO_AVISO = (
    Pedido.Status.ATRIBUIDO,
    Pedido.Status.CONFERINDO,
    Pedido.Status.AGUARDANDO_FECHAMENTO,
    Pedido.Status.NAO_CONFORME,
)
STATUS_OLHADOS = STATUS_VIRAM_EMBARCADO + STATUS_SO_AVISO

_DATA_VAZIA = 1950   # o Senior grava 31/12/1900 em data não preenchida

# Trava do desfazer: o maior embarque visto tem ~50 notas. Se de uma passada para a outra
# mais documentos que isso "saíram" de embarque, o mais provável é leitura errada do Senior
# (consulta vazia, janela trocada) — não desfaz nada e deixa registrado para alguém olhar.
LIMITE_DESFAZER = 100


def _s(v) -> str:
    return str(v if v is not None else '').strip()


def _inteiro(v) -> str:
    try:
        return str(int(v))
    except (TypeError, ValueError):
        return _s(v)


def _data_hora(data, minutos):
    """Data do Senior + hora em minutos desde a meia-noite → datetime com fuso; None se vazia."""
    if not isinstance(data, (dt.datetime, dt.date)) or data.year < _DATA_VAZIA:
        return None
    base = dt.datetime(data.year, data.month, data.day)
    try:
        base += dt.timedelta(minutes=max(int(minutos or 0), 0))
    except (TypeError, ValueError):
        pass
    return timezone.make_aware(base)


def chave_nota(codfil, codsnf, numero) -> tuple[str, str, str]:
    return (_inteiro(codfil), _s(codsnf), _inteiro(numero))


def chave_do_pedido(pedido: Pedido) -> tuple[str, str, str] | None:
    """Chave da nota do documento (a própria NF, ou a NF vinculada do pedido). Diferente de
    `identificacao_nf`, aceita documento antigo sem filial — a filial sai '' e quem procura
    usa `_achar` (série + número)."""
    if pedido.tipo == Pedido.Tipo.NOTA_FISCAL:
        codfil, codsnf, numero = pedido.codfil, pedido.codsnf, pedido.numero_externo
    else:
        codfil, codsnf, numero = pedido.nf_codfil, pedido.nf_codsnf, pedido.nf_numero
    if not _s(numero):
        return None
    return chave_nota(codfil, codsnf, numero)


def _achar(mapa: dict, chave):
    """(chave que casou, embarque) para a nota em `mapa`, ou (None, None). Documento antigo sem
    filial casa pela série + número — o mesmo critério na ida e na revisão do desfazer, senão
    ele seria embarcado e desfeito a cada passada."""
    if not chave:
        return None, None
    if chave in mapa:
        return chave, mapa[chave]
    if not chave[0]:
        for c, emb in mapa.items():
            if c[1] == chave[1] and c[2] == chave[2]:
                return c, emb
    return None, None


def embarque_da_linha(row: dict) -> dict:
    """Linha de E145EBQ + E145NFV → dados do embarque para o documento. A data que vale é a
    saída; sem ela, o fechamento; sem ele, a geração do embarque."""
    quando = (
        _data_hora(row.get('datsai'), row.get('horsai'))
        or _data_hora(row.get('datfec'), row.get('horfec'))
        or _data_hora(row.get('datger'), row.get('horger'))
    )
    return {
        'numero': _inteiro(row.get('numebq')),
        'placa': _s(row.get('plavei'))[:20],
        'motorista': _s(row.get('nommot'))[:120],
        'embarcado_em': quando,
        'fechado': _s(row.get('sitebq')) == '2',
    }


def embarques_por_nota(rows) -> dict:
    """{(filial, série, número da NF): embarque}. Nota em mais de um embarque (não visto em
    produção, mas possível) fica com o de maior número — o mais recente."""
    mapa = {}
    for r in rows:
        chave = chave_nota(r.get('filnfv'), r.get('snfnfv'), r.get('numnfv'))
        emb = embarque_da_linha(r)
        if not chave[2] or not emb['numero']:
            continue
        atual = mapa.get(chave)
        if atual is None or int(emb['numero']) > int(atual['numero']):
            mapa[chave] = emb
    return mapa


def _dados_log(emb: dict) -> dict:
    return {
        'embarque': emb['numero'], 'placa': emb['placa'], 'motorista': emb['motorista'],
        'embarcado_em': emb['embarcado_em'].isoformat() if emb['embarcado_em'] else None,
    }


def aplicar(pedido_id: int, emb: dict) -> str:
    """Grava o embarque no documento. Devolve o que aconteceu:
    'embarcado' / 'embarcado_sem_conferencia' (mudou de situação), 'aviso' (só os dados; alguém está com o documento),
    'atualizado' (já era Embarcado, mudou embarque/placa/motorista/data) ou '' (nada)."""
    with transaction.atomic():
        pedido = Pedido.objects.select_for_update(of=('self',)).select_related('sequencia').get(pk=pedido_id)
        if pedido.status not in STATUS_OLHADOS and pedido.status != Pedido.Status.EMBARCADO:
            return ''
        campos = []
        for campo, valor in (
            ('embarque_numero', emb['numero']), ('embarque_placa', emb['placa']),
            ('embarque_motorista', emb['motorista']), ('embarcado_em', emb['embarcado_em']),
        ):
            if getattr(pedido, campo) != valor:
                setattr(pedido, campo, valor)
                campos.append(campo)
        trocou_embarque = 'embarque_numero' in campos

        if pedido.status in STATUS_VIRAM_EMBARCADO:
            anterior = pedido.status
            pedido.status_anterior = anterior
            pedido.status = Pedido.Status.EMBARCADO
            pedido.save(update_fields=campos + ['status', 'status_anterior'])
            PedidoLog.objects.create(
                pedido=pedido, usuario=None, acao='embarcado',
                payload={
                    **_dados_log(emb), 'status_anterior': anterior,
                    'sem_conferencia': anterior != Pedido.Status.CONFERIDO,
                },
            )
            if pedido.sequencia_id:
                pedido.sequencia.recalcular_status()
            return 'embarcado' if anterior == Pedido.Status.CONFERIDO else 'embarcado_sem_conferencia'

        if not campos:
            return ''
        pedido.save(update_fields=campos)
        if pedido.status == Pedido.Status.EMBARCADO:
            if trocou_embarque:
                PedidoLog.objects.create(pedido=pedido, usuario=None, acao='embarque_alterado', payload=_dados_log(emb))
            return 'atualizado'
        if trocou_embarque:
            PedidoLog.objects.create(
                pedido=pedido, usuario=None, acao='embarque_detectado',
                payload={**_dados_log(emb), 'status': pedido.status},
            )
        return 'aviso'


def desfazer(pedido_id: int) -> str:
    """A nota não está mais em nenhum embarque no Senior: limpa os dados e, se o documento
    era Embarcado, devolve à situação anterior. Devolve 'desfeito', 'aviso_removido' ou ''."""
    with transaction.atomic():
        pedido = Pedido.objects.select_for_update(of=('self',)).select_related('sequencia').get(pk=pedido_id)
        if not pedido.embarque_numero:
            return ''
        payload = {
            'embarque': pedido.embarque_numero, 'placa': pedido.embarque_placa,
            'motorista': pedido.embarque_motorista,
        }
        era_embarcado = pedido.status == Pedido.Status.EMBARCADO
        pedido.embarque_numero = pedido.embarque_placa = pedido.embarque_motorista = ''
        pedido.embarcado_em = None
        campos = ['embarque_numero', 'embarque_placa', 'embarque_motorista', 'embarcado_em']
        if not era_embarcado:
            pedido.save(update_fields=campos)
            PedidoLog.objects.create(pedido=pedido, usuario=None, acao='embarque_desfeito',
                                     payload={**payload, 'status': pedido.status, 'so_aviso': True})
            return 'aviso_removido'

        volta = pedido.status_anterior if pedido.status_anterior in STATUS_VIRAM_EMBARCADO else Pedido.Status.PENDENTE
        pedido.status = volta
        pedido.status_anterior = ''
        pedido.save(update_fields=campos + ['status', 'status_anterior'])
        PedidoLog.objects.create(pedido=pedido, usuario=None, acao='embarque_desfeito',
                                 payload={**payload, 'status': volta})
        # Embarcado conta como final na sequência; voltando a Selecionado ela reabre
        # (mesmo cuidado da transferência de cancelado e do "Retomar conferência").
        seq = pedido.sequencia
        if seq and volta == Pedido.Status.SELECIONADO and seq.status == Sequencia.Status.CONCLUIDA:
            seq.status = Sequencia.Status.EM_ANDAMENTO
            seq.concluida_em = None
            seq.save(update_fields=['status', 'concluida_em'])
        return 'desfeito'


def _documentos_das_notas(chaves, status) -> list[tuple[int, tuple]]:
    """(id, chave da nota) dos documentos nesses status cuja nota está em `chaves` — a NF
    documento e o pedido faturado nela. Só valores (sem carregar os objetos)."""
    numeros = sorted({c[2] for c in chaves})
    achados = []
    for i in range(0, len(numeros), 1000):
        bloco = numeros[i:i + 1000]
        nfs = (Pedido.objects.filter(tipo=Pedido.Tipo.NOTA_FISCAL, status__in=status, numero_externo__in=bloco)
               .values_list('id', 'codfil', 'codsnf', 'numero_externo'))
        peds = (Pedido.objects.filter(tipo=Pedido.Tipo.PEDIDO, status__in=status, nf_numero__in=bloco)
                .values_list('id', 'nf_codfil', 'nf_codsnf', 'nf_numero'))
        for pid, codfil, codsnf, numero in list(nfs) + list(peds):
            casou, _ = _achar(chaves, chave_nota(codfil, codsnf, numero))
            if casou:
                achados.append((pid, casou))
    return achados


def sincronizar(rows, consultar_notas=None, dias_desfazer: int = 3) -> dict:
    """Aplica os embarques lidos do Senior (`rows` = linhas de QUERY_EMBARQUES_RECENTES).

    `consultar_notas(numeros)` → linhas de QUERY_EMBARQUES_DAS_NOTAS (ou None se o Oracle
    falhou): usada só para confirmar, sem janela, que a nota de um documento marcado nos
    últimos `dias_desfazer` dias saiu mesmo de todo embarque antes de desfazer.
    """
    mapa = embarques_por_nota(rows)
    resultado = {'notas_em_embarque': len(mapa), 'embarcados': 0, 'sem_conferencia': 0,
                 'avisos': 0, 'atualizados': 0, 'desfeitos': 0}

    for pid, chave in _documentos_das_notas(mapa, STATUS_OLHADOS):
        try:
            feito = aplicar(pid, mapa[chave])
        except Exception:
            logger.exception('embarque: falha ao aplicar', extra={'pedido': pid})
            continue
        if feito.startswith('embarcado'):
            resultado['embarcados'] += 1
            if feito == 'embarcado_sem_conferencia':
                resultado['sem_conferencia'] += 1
        elif feito == 'aviso':
            resultado['avisos'] += 1

    # Documentos já com embarque marcado há pouco: mudou de embarque? saiu do embarque?
    limite = timezone.now() - dt.timedelta(days=dias_desfazer)
    recentes = list(
        Pedido.objects.exclude(embarque_numero='')
        .filter(embarcado_em__gte=limite)
        .exclude(status=Pedido.Status.CANCELADO)
        .only('id', 'tipo', 'codfil', 'codsnf', 'numero_externo', 'nf_codfil', 'nf_codsnf', 'nf_numero',
              'embarque_numero', 'embarque_placa', 'embarque_motorista', 'embarcado_em')
    )
    sumidos = []
    for p in recentes:
        chave = chave_do_pedido(p)
        _, emb = _achar(mapa, chave)
        if emb is None:
            sumidos.append((p, chave))
        elif (p.embarque_numero, p.embarque_placa, p.embarque_motorista, p.embarcado_em) != (
                emb['numero'], emb['placa'], emb['motorista'], emb['embarcado_em']):
            if aplicar(p.id, emb) == 'atualizado':
                resultado['atualizados'] += 1
    if sumidos and consultar_notas is not None and not mapa:
        # nenhum embarque na janela inteira: leitura suspeita, não mexe em nada
        resultado['desfazer'] = 'ignorado_leitura_vazia'
        logger.error('embarque: consulta sem nenhum embarque na janela; desfazer ignorado',
                     extra={'documentos': len(sumidos)})
    elif sumidos and consultar_notas is not None:
        confirmacao = consultar_notas([c[2] for _, c in sumidos if c])
        if confirmacao is None:
            resultado['desfazer'] = 'falha_oracle'
        else:
            ainda = embarques_por_nota(confirmacao)
            fora = [(p, chave) for p, chave in sumidos if _achar(ainda, chave)[1] is None]
            if len(fora) > LIMITE_DESFAZER:
                resultado['desfazer'] = f'ignorado_{len(fora)}_documentos'
                logger.error('embarque: documentos demais sairiam de embarque de uma vez; desfazer ignorado',
                             extra={'documentos': len(fora), 'limite': LIMITE_DESFAZER})
                fora = []
            for p, chave in sumidos:
                emb = _achar(ainda, chave)[1]
                if emb is not None and aplicar(p.id, emb) == 'atualizado':
                    resultado['atualizados'] += 1
            for p, chave in fora:
                if desfazer(p.id):
                    resultado['desfeitos'] += 1
                    logger.info('embarque desfeito no Senior', extra={'pedido': p.id, 'embarque': p.embarque_numero})

    return resultado
