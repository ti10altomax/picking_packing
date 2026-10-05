import datetime as dt
from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def enviar_embalagem(self, pedido_id: int):
    """Envia notificação SOAP ao Senior (embalagempfa). Status já foi alterado pelo endpoint."""
    from apps.pedidos.models import Pedido, PedidoLog
    from .soap import notificar_embalagem

    pedido = Pedido.objects.get(pk=pedido_id)

    if pedido.embalagem_enviada_em:
        return

    try:
        notificar_embalagem(pedido.numero_externo)
        pedido.embalagem_enviada_em = timezone.now()
        pedido.save(update_fields=['embalagem_enviada_em'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=None,
            acao='embalagem_enviada', payload={},
        )
    except Exception as exc:
        pedido.embalagem_tentativas += 1
        pedido.embalagem_ultimo_erro = str(exc)
        pedido.save(update_fields=['embalagem_tentativas', 'embalagem_ultimo_erro'])
        raise self.retry(exc=exc)


def _make_aware(value):
    if isinstance(value, dt.datetime) and value.tzinfo is None:
        return timezone.make_aware(value)
    return value or timezone.now()


def _oracle_fetch_safe(query, params=None):
    """Executa fetch no Oracle capturando erros de conexão/configuração."""
    import oracledb
    from .oracle import fetch
    try:
        return fetch(query, params)
    except oracledb.exceptions.NotSupportedError as e:
        logger.error(
            "Oracle thin mode não suporta este servidor (verifier 0x939). "
            "Instale o Oracle Instant Client e rebuilde o container. "
            f"Detalhe: {e}"
        )
        return None
    except Exception as e:
        logger.error(f"Erro ao conectar no Oracle: {e}")
        return None


def _janela_dias() -> int:
    """Janela do sync em dias (Configuracao 'janela_sync_dias'; default 3)."""
    from apps.core.models import Configuracao
    valor = Configuracao.obter(Configuracao.Chave.JANELA_SYNC_DIAS)
    try:
        return max(int(valor), 0)
    except (TypeError, ValueError):
        logger.warning(f"janela_sync_dias inválida ({valor!r}); usando 3")
        return 3


def _importar_itens(pedido, query, params, col_qtd):
    """Busca os itens no Oracle (E120IPD ou E140IPV + E075DER/PRO) e popula PedidoItem."""
    from .oracle import SENIOR_CODEMP
    from apps.pedidos.models import PedidoItem

    rows = _oracle_fetch_safe(query, params)
    if not rows:
        logger.warning(f"{pedido} sem itens no Senior")
        return 0

    criados = 0
    for r in rows:
        codpro = str(r.get('codpro') or '').strip()
        codder = str(r.get('codder') or '').strip()
        if not codpro:
            continue

        qtd = int(r.get(col_qtd) or 0)
        if qtd <= 0:
            continue

        ean = str(r.get('codbar') or '').strip()
        descricao = str(r.get('despro') or '').strip() or f'{codpro}-{codder}'
        sku = f'{codpro}-{codder}-{SENIOR_CODEMP}'

        PedidoItem.objects.create(
            pedido=pedido,
            sku=sku,
            descricao=descricao[:255],
            ean=ean[:20],
            qtd_pedida=qtd,
            codpro=codpro,
            codder=codder,
            codemp=SENIOR_CODEMP,
        )
        criados += 1
    return criados


def _transportadora(row) -> tuple[str, str]:
    """(codtra, nome) a partir da linha do Oracle. CODTRA é numérico no Senior e vem
    como int/Decimal; 0/None = sem transportadora (retira, sem frete). Sem nome no
    cadastro, usa o próprio código para não ficar vazio na tela."""
    bruto = row.get('codtra')
    try:
        codigo = int(bruto) if bruto is not None else 0
    except (TypeError, ValueError):
        codigo = 0
    if not codigo:
        return '', ''
    nome = str(row.get('nomtra') or '').strip()
    return str(codigo), (nome or f'Transportadora {codigo}')[:255]


def _localizar_ou_criar(tipo, numero, codfil, codsnf, cliente, criado_em, frete,
                        codtra='', transportadora=''):
    """Localiza o documento pela identidade Senior (tipo, codfil, codsnf, numero) ou cria.

    Compat: pedidos importados antes de codfil existir ficaram com codfil=''.
    Se não houver linha com o codfil exato, adota a linha legada e preenche o codfil
    em vez de duplicar. Devolve (pedido, criado, atualizado).
    """
    from django.db import IntegrityError
    from apps.pedidos.models import Pedido

    base = Pedido.objects.filter(tipo=tipo, numero_externo=numero, codsnf=codsnf)
    pedido = base.filter(codfil=codfil).first()
    if pedido is None and codfil:
        pedido = base.filter(codfil='').first()

    if pedido is not None:
        campos = []
        if pedido.codfil != codfil:
            pedido.codfil = codfil
            campos.append('codfil')
        if not pedido.cliente and cliente:
            pedido.cliente = cliente
            campos.append('cliente')
        if not pedido.frete and frete:
            pedido.frete = frete
            campos.append('frete')
        if not pedido.codtra and codtra:
            pedido.codtra = codtra
            pedido.transportadora = transportadora
            campos += ['codtra', 'transportadora']
        if campos:
            pedido.save(update_fields=campos)
        return pedido, False, bool(campos)

    try:
        pedido = Pedido.objects.create(
            tipo=tipo, numero_externo=numero, codfil=codfil, codsnf=codsnf,
            cliente=cliente, criado_em=criado_em, frete=frete,
            codtra=codtra, transportadora=transportadora,
            status=Pedido.Status.PENDENTE,
        )
    except IntegrityError:
        # sync concorrente (beat + disparo manual) criou primeiro
        pedido = base.get(codfil=codfil)
        return pedido, False, False
    return pedido, True, False


def _sincronizar_fonte(tipo, rows, col_numero, col_qtd, query_itens, params_itens):
    """Importa as linhas de uma fonte (pedidos ou NFs) como Pendente + itens."""
    from apps.pedidos.models import Pedido

    criados = atualizados = itens_importados = 0
    for row in rows:
        numero = str(row.get(col_numero) or '').strip()
        if not numero:
            continue

        codfil = str(row.get('codfil') or '').strip()
        codsnf = str(row.get('codsnf') or '').strip() if tipo == Pedido.Tipo.NOTA_FISCAL else ''
        cliente = str(row.get('nomcli') or row.get('codcli') or '').strip()
        frete = str(row.get('ciffob') or '').strip().upper()[:1]
        codtra, transportadora = _transportadora(row)
        criado_em = _make_aware(row.get('datemi'))

        pedido, created, updated = _localizar_ou_criar(
            tipo, numero, codfil, codsnf, cliente, criado_em, frete,
            codtra, transportadora,
        )

        if created:
            criados += 1
            try:
                qtd = _importar_itens(pedido, query_itens, params_itens(numero, codfil, codsnf), col_qtd)
                itens_importados += qtd
                logger.info(f"{pedido}: {qtd} item(ns) importado(s)")
            except Exception as exc:
                logger.error(f"Erro importando itens de {pedido}: {exc}")
        elif updated:
            atualizados += 1

    return {'criados': criados, 'atualizados': atualizados, 'itens_importados': itens_importados}


@shared_task
def sincronizar_pedidos_oracle():
    """
    Importa do Senior como Pendente no Postgres, dentro da janela configurada:
      - pedidos com sitPed=1 (Aberto Total) — E120PED/E120IPD;
      - notas fiscais de venda com sitNfv=2 e sem pedido de origem — E140NFV/E140IPV.
    Para cada documento novo, importa os itens (+ E075DER + E075PRO).
    Roda a cada 2 minutos via Celery Beat.
    """
    from .oracle import (
        QUERY_PEDIDOS_PENDENTES, QUERY_ITENS_PEDIDO,
        QUERY_NF_PENDENTES, QUERY_ITENS_NF,
    )
    from apps.pedidos.models import Pedido

    janela = _janela_dias()
    fontes = (
        ('pedidos', Pedido.Tipo.PEDIDO, QUERY_PEDIDOS_PENDENTES, 'numped', 'qtdabe',
         QUERY_ITENS_PEDIDO, lambda numero, codfil, codsnf: [numero, codfil]),
        ('notas_fiscais', Pedido.Tipo.NOTA_FISCAL, QUERY_NF_PENDENTES, 'numnfv', 'qtdfat',
         QUERY_ITENS_NF, lambda numero, codfil, codsnf: [numero, codfil, codsnf]),
    )

    resultado = {'janela_dias': janela}
    for chave, tipo, query_lista, col_numero, col_qtd, query_itens, params_itens in fontes:
        rows = _oracle_fetch_safe(query_lista, [janela])
        if rows is None:
            resultado[chave] = {'erro': 'falha_oracle'}
            continue
        if not rows:
            logger.info(f"sincronizar_pedidos_oracle[{chave}]: nenhuma linha retornada")
            resultado[chave] = {'criados': 0, 'atualizados': 0, 'itens_importados': 0}
            continue

        parcial = _sincronizar_fonte(tipo, rows, col_numero, col_qtd, query_itens, params_itens)
        logger.info(
            f"sincronizar_pedidos_oracle[{chave}]: {parcial['criados']} criados, "
            f"{parcial['atualizados']} atualizados, {parcial['itens_importados']} itens"
        )
        resultado[chave] = parcial

    return resultado


def _blocos(lista, tamanho=500):
    for i in range(0, len(lista), tamanho):
        yield lista[i:i + tamanho]


def _situacoes_no_senior(query, numeros, chave_fn):
    """Consulta a situação dos números no Oracle em blocos; devolve {chave: situacao}.

    Devolve None se alguma consulta falhar — melhor não cancelar nada do que
    cancelar com informação parcial.
    """
    situacoes = {}
    for bloco in _blocos(sorted(set(numeros))):
        placeholders = ','.join(':' + str(i + 1) for i in range(len(bloco)))
        rows = _oracle_fetch_safe(query.format(placeholders=placeholders), bloco)
        if rows is None:
            return None
        for r in rows:
            situacoes[chave_fn(r)] = r
    return situacoes


@shared_task
def monitorar_cancelamentos(passada_completa: bool = False):
    """
    Detecta documentos cancelados no Senior depois de importados (2026-09-30).
      - pedido: E120PED.sitPed = 5
      - nota fiscal: E140NFV.sitNfv = 9
    Olha todo documento em andamento (Selecionado … Não conforme), mais Pendentes e
    Conferidos dentro da janela do sync. Quem foi cancelado vira Cancelado aqui,
    preservando volumes e progresso para a transferência (apps.pedidos.cancelamento).
    Roda a cada 60 s via Celery Beat. A tela do conferente descobre pelo polling do
    detalhe e pelo 409 `pedido_cancelado` em qualquer ação.

    Pendentes fora da janela são ignorados no beat — são milhares acumulados (o sync
    não reconcilia) e a checagem levaria dezenas de segundos. `passada_completa=True`
    inclui todos; usar à mão (`manage.py monitorar_cancelamentos --completa`).

    De carona (2026-10-05): a mesma consulta traz codtra/nomtra, e documentos em
    andamento ainda sem transportadora (importados antes do campo existir, ou fora
    da janela do sync) são preenchidos aqui — sem passada extra no Oracle.
    """
    from .oracle import (
        QUERY_SITUACAO_PEDIDOS, QUERY_SITUACAO_NFS, SITPED_CANCELADO, SITNFV_CANCELADO,
    )
    from apps.pedidos.models import Pedido
    from apps.pedidos.cancelamento import STATUS_MONITORADOS, cancelar

    limite = timezone.now() - dt.timedelta(days=max(_janela_dias(), 1))
    qs = Pedido.objects.filter(status__in=STATUS_MONITORADOS).select_related('sequencia')
    qs = qs.exclude(status=Pedido.Status.CONFERIDO, conferido_em__lt=limite)
    if not passada_completa:
        qs = qs.exclude(status=Pedido.Status.PENDENTE, criado_em__lt=limite)
    candidatos = list(qs)
    if not candidatos:
        return {'verificados': 0, 'cancelados': 0}

    def _s(v):
        return str(v or '').strip()

    fontes = {
        Pedido.Tipo.PEDIDO: (
            QUERY_SITUACAO_PEDIDOS,
            lambda r: (_s(r.get('codfil')), '', _s(r.get('numped'))),
            lambda r: _s(r.get('sitped')) == str(SITPED_CANCELADO),
        ),
        Pedido.Tipo.NOTA_FISCAL: (
            QUERY_SITUACAO_NFS,
            lambda r: (_s(r.get('codfil')), _s(r.get('codsnf')), _s(r.get('numnfv'))),
            lambda r: _s(r.get('sitnfv')) == str(SITNFV_CANCELADO),
        ),
    }

    cancelados = transportadoras = 0
    resultado = {'verificados': len(candidatos)}
    for tipo, (query, chave_fn, cancelado_fn) in fontes.items():
        do_tipo = [p for p in candidatos if p.tipo == tipo]
        if not do_tipo:
            continue
        situacoes = _situacoes_no_senior(query, [p.numero_externo for p in do_tipo], chave_fn)
        if situacoes is None:
            resultado[tipo] = 'falha_oracle'
            continue
        for pedido in do_tipo:
            # Compat: linhas antigas sem codfil casam só pelo número
            row = situacoes.get((pedido.codfil, pedido.codsnf, pedido.numero_externo))
            if row is None and not pedido.codfil:
                row = next(
                    (r for k, r in situacoes.items() if k[1] == pedido.codsnf and k[2] == pedido.numero_externo),
                    None,
                )
            if row is None:
                continue
            if not pedido.codtra:
                codtra, transportadora = _transportadora(row)
                if codtra:
                    pedido.codtra, pedido.transportadora = codtra, transportadora
                    pedido.save(update_fields=['codtra', 'transportadora'])
                    transportadoras += 1
            if not cancelado_fn(row):
                continue
            situacao = _s(row.get('sitped') or row.get('sitnfv'))
            cancelar(pedido, Pedido.OrigemCancelamento.SENIOR, payload={'situacao_senior': situacao})
            cancelados += 1
            logger.info(f"{pedido} cancelado no Senior (situação {situacao}) → status CANCELADO")

    resultado['cancelados'] = cancelados
    resultado['transportadoras_preenchidas'] = transportadoras
    logger.info(f"monitorar_cancelamentos: {len(candidatos)} verificados, {cancelados} cancelados")
    return resultado


@shared_task
def monitorar_faturamento():
    """
    Detecta pedidos que o Senior faturou (sitPed=4 Liquidado).
    Para cada pedido nosso em status SEPARADA, verifica o sitPed no Oracle.
    Quando sitPed=4, transita para FATURADO no Postgres.
    Roda a cada 2 minutos via Celery Beat.
    """
    from .oracle import QUERY_SITPED_POR_NUMEROS, fetch
    from apps.pedidos.models import Pedido, PedidoLog
    import oracledb

    pedidos_conferidos = list(
        Pedido.objects.filter(status=Pedido.Status.CONFERINDO)
        .values_list('id', 'numero_externo')
    )

    if not pedidos_conferidos:
        return {'verificados': 0, 'faturados': 0}

    numeros = [n for _, n in pedidos_conferidos]
    placeholders = ','.join([':' + str(i + 1) for i in range(len(numeros))])
    query = QUERY_SITPED_POR_NUMEROS.format(placeholders=placeholders)

    rows = _oracle_fetch_safe(query, numeros)
    if rows is None:
        return {'erro': 'falha_oracle'}

    # sitPed=4 significa Liquidado (faturado pelo Senior)
    faturados_senior = {
        str(r.get('numped', '')).strip()
        for r in rows
        if str(r.get('sitped', '')).strip() == '4'
    }

    faturados = 0
    for pedido_id, numero in pedidos_conferidos:
        if numero not in faturados_senior:
            continue
        Pedido.objects.filter(pk=pedido_id, status=Pedido.Status.CONFERINDO).update(
            status=Pedido.Status.FATURADO,
            faturado_em=timezone.now(),
        )
        PedidoLog.objects.create(
            pedido_id=pedido_id,
            usuario=None,
            acao='faturado_senior',
            payload={'sitped': 4},
        )
        faturados += 1
        logger.info(f"Pedido {numero} faturado pelo Senior → status FATURADO")

    logger.info(f"monitorar_faturamento: {len(pedidos_conferidos)} verificados, {faturados} faturados")
    return {'verificados': len(pedidos_conferidos), 'faturados': faturados}
