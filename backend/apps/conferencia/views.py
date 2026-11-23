import logging
import re
from datetime import timedelta
from django.db import models, transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import Configuracao
from apps.pedidos.cancelamento import (
    STATUS_DESTINO_TRANSFERENCIA, TransferenciaInvalida, cancelar, comparar_itens, transferir,
)
from apps.pedidos.models import (
    DivergenciaBarra, ErroSeparacao, Pedido, PedidoItem, PedidoLog,
    Separador, Sequencia, Volume, VolumeItem,
)
from .fardo import FardoErro, desfazer_fardo, ler_fardo

logger = logging.getLogger(__name__)

# bipar: mesmo lançamento repetido dentro desta janela é a mesma leitura (ver `bipar`)
JANELA_REPETICAO_MS = 700


def _exige_conferente(request):
    if request.user.perfil not in ('conferente', 'admin'):
        return Response(
            {'erro': 'restrito ao Conferente'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return None


def _exige_supervisor_ou_admin(request):
    if request.user.perfil not in ('supervisor_patio', 'supervisor_vendas', 'admin'):
        return Response(
            {'erro': 'restrito a Supervisor ou Admin'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return None


STATUS_PENDENTES = (Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO)


def _resposta_cancelado(pedido):
    """409 com `resultado: pedido_cancelado` — o cliente troca a tela por um bloqueio."""
    return Response(
        {
            'resultado': 'pedido_cancelado',
            'erro': 'documento cancelado no Senior — a conferência deve ser interrompida',
            'cancelado_em': pedido.cancelado_em,
            'cancelado_origem': pedido.cancelado_origem,
        },
        status=http_status.HTTP_409_CONFLICT,
    )


def _guard_pedido(request, pedido, bloquear_cancelado=True):
    """Ownership (conferente do pedido ou admin) + bloqueio de documento cancelado.

    O bloqueio no servidor é a garantia real: mesmo sem nenhum aviso chegar ao
    coletor, o conferente não passa do próximo bipe. O GET de detalhe não bloqueia,
    porque é por ele (polling) que a tela descobre o cancelamento.
    """
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)
    if bloquear_cancelado and pedido.status == Pedido.Status.CANCELADO:
        return _resposta_cancelado(pedido)
    return None


def _minhas_sequencias(user):
    """Sequências com pedidos do conferente, FIFO pela 1ª atribuição dele."""
    return list(
        Sequencia.objects
        .filter(pedidos__conferente=user)
        .annotate(primeira_atribuicao=models.Min(
            'pedidos__atribuido_em',
            filter=models.Q(pedidos__conferente=user),
        ))
        .order_by('primeira_atribuicao')
        .distinct()
    )


def _sequencia_ativa(user):
    """(ativa, aguardando) — trava de sequência do DESIGN.md §3.

    ativa: a sequência mais antiga com pedidos pendentes do conferente.
    aguardando: na regra 'ao_concluir_sequencia_inteira', a sequência anterior
    ainda não concluída que bloqueia a próxima (o conferente fica em espera).
    """
    regra = Configuracao.obter(Configuracao.Chave.LIBERACAO_PROXIMA_SEQUENCIA)
    seqs = _minhas_sequencias(user)
    for i, seq in enumerate(seqs):
        tem_pendentes = seq.pedidos.filter(conferente=user, status__in=STATUS_PENDENTES).exists()
        if not tem_pendentes:
            continue
        if regra == 'ao_concluir_sequencia_inteira':
            anteriores = [s for s in seqs[:i] if s.status != Sequencia.Status.CONCLUIDA]
            if anteriores:
                return None, anteriores[0]
        return seq, None
    return None, None


def _trava_para_pegar(user, seq):
    """Mensagem de bloqueio da trava de sequência para o conferente PEGAR um pedido
    de `seq` (ponto 4 da diretoria, leitura B — 2026-10-06), ou None se pode.

    Mesma regra do iniciar: só se mexe na sequência ativa. Sem pendências (ativa
    nula) qualquer sequência serve; com a regra 'ao_concluir_sequencia_inteira',
    toda sequência mais antiga precisa estar concluída.
    """
    if user.perfil == 'admin':
        return None
    ativa, aguardando = _sequencia_ativa(user)
    if aguardando:
        return f'aguarde a conclusão da sequência {aguardando.numero} para pegar da próxima'
    if ativa and ativa.id != seq.id:
        return f'termine a sequência {ativa.numero} primeiro'
    regra = Configuracao.obter(Configuracao.Chave.LIBERACAO_PROXIMA_SEQUENCIA)
    if regra == 'ao_concluir_sequencia_inteira':
        anterior = (
            Sequencia.objects.filter(numero__lt=seq.numero)
            .exclude(status=Sequencia.Status.CONCLUIDA)
            .order_by('numero').first()
        )
        if anterior:
            return f'aguarde a conclusão da sequência {anterior.numero} para pegar da próxima'
    return None


def _disponiveis(seq):
    """Pedidos da sequência ainda sem conferente (o Pátio sequenciou, ninguém pegou)."""
    return (
        seq.pedidos
        .filter(status=Pedido.Status.SELECIONADO, conferente__isnull=True)
        .select_related('sequencia')
        .prefetch_related('itens')
        .order_by('criado_em')
    )


def _sequencia_para_pegar(user):
    """Sequência mais antiga com pedidos sem conferente de onde este conferente pode
    pegar agora, ou None. Guia a lista "Disponíveis" do coletor."""
    seqs = (
        Sequencia.objects
        .exclude(status=Sequencia.Status.CONCLUIDA)
        .filter(pedidos__status=Pedido.Status.SELECIONADO, pedidos__conferente__isnull=True)
        .distinct().order_by('numero')
    )
    for seq in seqs:
        if _trava_para_pegar(user, seq) is None:
            return seq
    return None


def _interpretar_codigo(codigo: str):
    """Código bipado/digitado → (numero, serie | None, veio_de_chave).

    Chave de acesso da NF-e (44 dígitos, código de barras do DANFE): série nas
    posições 23-25 e número nas 26-34 (1-based). Qualquer outra coisa é tratada
    como número do documento (NF ou pedido) digitado/bipado do papel.
    """
    digitos = re.sub(r'\D', '', codigo or '')
    if len(digitos) == 44:
        return str(int(digitos[25:34])), str(int(digitos[22:25])), True
    if not digitos:
        return None, None, False
    return str(int(digitos)), None, False


def _serie_confere(codsnf: str, serie: str) -> bool:
    # codsnf do Senior pode ser alfanumérico ('NFE'); a série da chave só é
    # comparada quando a nossa é numérica — senão não filtra por ela.
    return not codsnf.strip().isdigit() or int(codsnf) == int(serie)


def _candidatos_por_codigo(numero, serie, veio_de_chave):
    """Documentos locais que casam com o código lido. Pelo DANFE vale a NF importada
    como documento e o pedido já faturado com essa NF (`Pedido.nf_*`, E140IPV), com a
    série conferida; por número solto vale NF ou pedido pelo `numero_externo` —
    ambiguidade volta para o usuário."""
    qs = Pedido.objects.select_related('conferente', 'sequencia')
    if veio_de_chave:
        qs = qs.filter(
            models.Q(tipo=Pedido.Tipo.NOTA_FISCAL, numero_externo=numero)
            | models.Q(tipo=Pedido.Tipo.PEDIDO, nf_numero=numero)
        )
        cands = [
            p for p in qs.order_by('-criado_em')
            if _serie_confere(p.codsnf if p.tipo == Pedido.Tipo.NOTA_FISCAL else p.nf_codsnf, serie)
        ]
    else:
        cands = list(qs.filter(numero_externo=numero).order_by('-criado_em'))
    # escopo antigo congelado não entra
    cands = [p for p in cands if p.status not in ('faturado', 'aguardando_etiquetar', 'concluido')]
    return cands


def _vincular_nf_da_chave(numero, serie) -> str:
    """Chave sem documento local: NF emitida há pouco que o sync ainda não trouxe. Traz na
    hora pela mesma regra do sync (`importar_nf`): faturamento de pedido em conferência →
    vincula a nota ao pedido; senão vira documento (faturamento parcial, 2026-11-05).
    Devolve um aviso para o 404 quando não deu ('' se trouxe ou nada a dizer)."""
    from apps.senior.tasks import importar_nf  # lazy: tasks importa models de vários apps

    try:
        importar_nf(numero, aceita=lambda r: _serie_confere(str(r.get('codsnf') or ''), serie))
    except Exception:
        logger.exception('pegar: falha ao consultar a NF no Senior', extra={'nf': numero})
        return f'não consegui consultar a NF {numero} no Senior — tente de novo'
    return ''


def _resolver_apontamento(request):
    """Valida o "separado por" do body → (separador, nao_identificado, erro).

    Obrigatório: ou `separado_por` (id de Separador ativo e liberado hoje) ou
    `nao_identificado: true` — a opção "Não identificado" fica destacada nos
    relatórios (DESIGN.md §2).
    """
    separado_por_id = request.data.get('separado_por')
    nao_identificado = bool(request.data.get('nao_identificado'))

    if nao_identificado and separado_por_id:
        return None, False, Response(
            {'erro': 'informe separado_por OU nao_identificado, não os dois'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not nao_identificado and not separado_por_id:
        return None, False, Response(
            {'erro': 'informe quem separou o pedido (separado_por ou nao_identificado)'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if nao_identificado:
        return None, True, None

    separador = Separador.objects.filter(pk=separado_por_id, ativo=True).first()
    if not separador:
        return None, False, Response(
            {'erro': 'separador inválido ou inativo'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if not separador.liberacoes.filter(data=timezone.localdate()).exists():
        return None, False, Response(
            {'erro': f'separador "{separador}" não está liberado hoje — peça ao Sup. Pátio'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    return separador, False, None


def _serializar_volume(v: Volume) -> dict:
    return {
        'id': v.id,
        'tipo': v.tipo,
        'identificador': v.identificador,
        'op': v.op,
        'criado_em': v.criado_em,
        'fechado_em': v.fechado_em,
        'itens': [
            {
                'id': vi.id,
                'pedido_item_id': vi.pedido_item_id,
                'qtd': vi.qtd,
                'criado_em': vi.criado_em,
            }
            for vi in v.itens.all()
        ],
    }


def _serializar_pedido(p: Pedido, com_volumes: bool = False) -> dict:
    from apps.pedidos.alias_barra import alternativos_por_ean
    from .caixas import estimar as estimar_caixas, volume_caixa, volume_unitario

    itens = list(p.itens.all())
    # Barras erradas da fábrica cadastradas como alternativas (2026-11-17): web e coletor
    # casam o código bipado localmente, então precisam saber o que mais é aceito por item.
    alternativos = alternativos_por_ean(i.ean for i in itens)
    total_pedido = sum(i.qtd_pedida for i in itens if i.status == PedidoItem.Status.OK)
    total_conferido = sum(i.qtd_separada for i in itens if i.status == PedidoItem.Status.OK)
    percent = round(total_conferido / total_pedido * 100, 1) if total_pedido else 0
    divisor = volume_caixa()

    dados = {
        'id': p.id,
        'tipo': p.tipo,
        'numero_externo': p.numero_externo,
        'pedidos_origem': p.pedidos_origem,
        'frete': p.frete,
        'frete_label': p.frete_label,
        'transportadora': p.transportadora,
        'cliente': p.cliente,
        'status': p.status,
        'criado_em': p.criado_em,
        'atribuido_em': p.atribuido_em,
        'conferencia_iniciada_em': p.conferencia_iniciada_em,
        'sequencia': (
            {'id': p.sequencia.id, 'numero': p.sequencia.numero, 'descricao': p.sequencia.descricao} if p.sequencia else None
        ),
        'separado_por': (
            {'id': p.separado_por.id, 'nome': p.separado_por.nome, 'apelido': p.separado_por.apelido}
            if p.separado_por else None
        ),
        'separador_nao_identificado': p.separador_nao_identificado,
        'cancelado_em': p.cancelado_em,
        'cancelado_origem': p.cancelado_origem,
        'status_anterior': p.status_anterior,
        'transferido_para_id': p.transferido_para_id,
        'qtd_itens': len(itens),
        'percent_conferido': percent,
        # soma(qtd × medidas da derivação) / caixa padrão; > 1 → avisar que não cabe numa caixa
        'estimativa_caixas': estimar_caixas(itens, divisor),
        # Caixa cheia (2026-11-23): a tela soma volume_unitario × qtd do volume aberto e,
        # quando a leitura faz passar de volume_caixa, para o conferente com um diálogo.
        'volume_caixa': float(divisor),
        'itens': [
            {
                'id': i.id, 'sku': i.sku, 'descricao': i.descricao, 'ean': i.ean,
                'codigos_alternativos': alternativos.get(i.ean, []),
                'qtd_pedida': i.qtd_pedida, 'qtd_separada': i.qtd_separada,
                'status': i.status,
                'volume_unitario': volume_unitario(i),
            }
            for i in itens
        ],
    }
    if com_volumes:
        dados['volumes'] = [_serializar_volume(v) for v in p.volumes.all().prefetch_related('itens')]
    return dados


# ---------------------------------------------------------------------------
# Lista — pedidos atribuídos ao usuário logado
# ---------------------------------------------------------------------------

@api_view(['GET'])
def listar_atribuidos(request):
    """Pedidos da sequência ativa do conferente (FIFO por atribuição).

    Retorna também o contexto da trava: qual sequência está ativa, se o
    conferente está aguardando outra concluir (regra configurável) e quantos
    pedidos existem em sequências futuras.
    """
    err = _exige_conferente(request)
    if err:
        return err

    ativa, aguardando = _sequencia_ativa(request.user)

    # Transição: pedidos antigos sem sequência continuam sempre visíveis
    pedidos = list(
        Pedido.objects
        .filter(conferente=request.user, sequencia__isnull=True, status__in=STATUS_PENDENTES)
        .select_related('separado_por', 'sequencia')
        .prefetch_related('itens')
        .order_by('atribuido_em', 'criado_em')
    )
    if ativa:
        pedidos += list(
            ativa.pedidos
            .filter(conferente=request.user, status__in=STATUS_PENDENTES)
            .select_related('separado_por', 'sequencia')
            .prefetch_related('itens')
            .order_by('atribuido_em', 'criado_em')
        )

    outras = (
        Pedido.objects
        .filter(conferente=request.user, status__in=STATUS_PENDENTES, sequencia__isnull=False)
        .exclude(sequencia_id=ativa.id if ativa else 0)
        .count()
    )

    # Ponto 4 (leitura B): pedidos sem conferente que ele pode pegar agora — bipando a
    # nota ou tocando na lista. Só da sequência mais antiga liberada pela trava.
    seq_pegar = _sequencia_para_pegar(request.user)
    disponiveis = list(_disponiveis(seq_pegar)) if seq_pegar else []

    return Response({
        'sequencia': {'id': ativa.id, 'numero': ativa.numero, 'descricao': ativa.descricao} if ativa else None,
        'aguardando_sequencia': (
            {'id': aguardando.id, 'numero': aguardando.numero, 'descricao': aguardando.descricao} if aguardando else None
        ),
        'pedidos': [_serializar_pedido(p) for p in pedidos],
        'outras_sequencias_pendentes': outras,
        'sequencia_disponivel': (
            {'id': seq_pegar.id, 'numero': seq_pegar.numero, 'descricao': seq_pegar.descricao} if seq_pegar else None
        ),
        'disponiveis': [_serializar_pedido(p) for p in disponiveis],
    })


# ---------------------------------------------------------------------------
# Detalhe — inclui volumes existentes
# ---------------------------------------------------------------------------

@api_view(['GET'])
def detalhe(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(
        Pedido.objects.select_related('separado_por', 'sequencia').prefetch_related('itens', 'volumes__itens'),
        pk=pk,
    )
    err = _guard_pedido(request, pedido, bloquear_cancelado=False)
    if err:
        return err

    return Response(_serializar_pedido(pedido, com_volumes=True))


# ---------------------------------------------------------------------------
# Iniciar conferência (Atribuído → Em conferência)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def iniciar(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status == Pedido.Status.CONFERINDO:
        return Response({'ok': True, 'ja_iniciado': True})
    if pedido.status != Pedido.Status.ATRIBUIDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", esperado "atribuido"'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Trava de sequência (DESIGN.md §3): só inicia pedido da sequência ativa
    if pedido.sequencia_id and request.user.perfil != 'admin':
        ativa, aguardando = _sequencia_ativa(request.user)
        if not ativa or ativa.id != pedido.sequencia_id:
            if aguardando:
                msg = f'aguarde a conclusão da sequência {aguardando.numero} para iniciar a próxima'
            elif ativa:
                msg = (
                    f'este pedido é da sequência {pedido.sequencia.numero} — '
                    f'termine a sequência {ativa.numero} primeiro'
                )
            else:
                msg = 'este pedido não está na sua sequência ativa'
            return Response({'erro': msg}, status=http_status.HTTP_409_CONFLICT)

    separador, nao_identificado, err = _resolver_apontamento(request)
    if err:
        return err

    pedido.status = Pedido.Status.CONFERINDO
    pedido.conferencia_iniciada_em = timezone.now()
    pedido.separado_por = separador
    pedido.separador_nao_identificado = nao_identificado
    pedido.save(update_fields=[
        'status', 'conferencia_iniciada_em', 'separado_por', 'separador_nao_identificado',
    ])
    if pedido.sequencia and pedido.sequencia.status == Sequencia.Status.ABERTA:
        pedido.sequencia.status = Sequencia.Status.EM_ANDAMENTO
        pedido.sequencia.save(update_fields=['status'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='conferencia_iniciada',
        payload={
            'separado_por_id': separador.id if separador else None,
            'separado_por': str(separador) if separador else None,
            'nao_identificado': nao_identificado,
        },
    )
    return Response({'ok': True, 'conferencia_iniciada_em': pedido.conferencia_iniciada_em})


# ---------------------------------------------------------------------------
# Alterar o apontamento "separado por" (editável até concluir)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def alterar_separado_por(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}" — apontamento só pode ser alterado durante a conferência'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    separador, nao_identificado, err = _resolver_apontamento(request)
    if err:
        return err

    anterior = (
        str(pedido.separado_por) if pedido.separado_por
        else ('nao_identificado' if pedido.separador_nao_identificado else None)
    )
    pedido.separado_por = separador
    pedido.separador_nao_identificado = nao_identificado
    pedido.save(update_fields=['separado_por', 'separador_nao_identificado'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='separado_por_alterado',
        payload={
            'anterior': anterior,
            'separado_por_id': separador.id if separador else None,
            'separado_por': str(separador) if separador else None,
            'nao_identificado': nao_identificado,
        },
    )
    return Response({
        'ok': True,
        'separado_por': (
            {'id': separador.id, 'nome': separador.nome, 'apelido': separador.apelido}
            if separador else None
        ),
        'separador_nao_identificado': nao_identificado,
    })


# ---------------------------------------------------------------------------
# Volumes — criar
# ---------------------------------------------------------------------------

@api_view(['POST'])
def criar_volume(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status != Pedido.Status.CONFERINDO:
        # A conferência precisa ser iniciada antes (apontando quem separou).
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não permite criar volume — inicie a conferência primeiro'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    tipo = request.data.get('tipo', '').strip()
    if tipo not in (Volume.Tipo.CAIXA, Volume.Tipo.FARDO, Volume.Tipo.OUTRO):
        return Response({'erro': 'tipo inválido (caixa, fardo ou outro)'}, status=http_status.HTTP_400_BAD_REQUEST)

    identificador = (request.data.get('identificador') or '').strip()

    with transaction.atomic():
        volume = Volume.objects.create(
            pedido=pedido, tipo=tipo, identificador=identificador,
            criado_por=request.user,
        )
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='volume_criado',
            payload={'volume_id': volume.id, 'tipo': tipo, 'identificador': identificador},
        )

    return Response(_serializar_volume(volume), status=http_status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Bipar item dentro de um volume
# ---------------------------------------------------------------------------

@api_view(['POST'])
def bipar(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    item_id = request.data.get('item_id')
    qtd = request.data.get('qtd')
    codigo = (request.data.get('codigo') or '').strip()
    volume_id = request.data.get('volume_id')

    if not item_id or not qtd or not codigo or not volume_id:
        return Response(
            {'erro': 'item_id, qtd, codigo e volume_id são obrigatórios'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    try:
        qtd = int(qtd)
    except (TypeError, ValueError):
        return Response({'erro': 'qtd inválida'}, status=http_status.HTTP_400_BAD_REQUEST)
    if qtd < 1:
        return Response({'erro': 'qtd deve ser maior que zero'}, status=http_status.HTTP_400_BAD_REQUEST)

    item = pedido.itens.filter(pk=item_id).first()
    if not item:
        return Response({'resultado': 'nao_encontrado', 'erro': 'item não pertence ao pedido'},
                        status=http_status.HTTP_404_NOT_FOUND)

    if item.status != PedidoItem.Status.OK:
        return Response(
            {'resultado': 'item_indisponivel', 'erro': f'item está como "{item.status}"'},
            status=http_status.HTTP_409_CONFLICT,
        )

    # Barra errada da fábrica cadastrada como alternativa (2026-11-17): passa, mas vira
    # DivergenciaBarra para a cobrança, igual à liberada pelo supervisor.
    alias = None
    if codigo != item.ean and codigo != item.sku:
        from apps.pedidos.alias_barra import alias_para
        alias = alias_para(codigo, item)
    if codigo != item.ean and codigo != item.sku and not alias:
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='bip_codigo_divergente',
            payload={'item_id': item.id, 'codigo': codigo, 'sku': item.sku, 'ean': item.ean},
        )
        return Response(
            {'resultado': 'codigo_divergente',
             'erro': f'código bipado não corresponde ao item (esperado SKU {item.sku} ou EAN {item.ean})'},
            status=http_status.HTTP_409_CONFLICT,
        )

    if item.qtd_separada + qtd > item.qtd_pedida:
        return Response(
            {'resultado': 'excesso',
             'qtd_pedida': item.qtd_pedida,
             'qtd_ja_separada': item.qtd_separada,
             'qtd_solicitada': qtd},
            status=http_status.HTTP_409_CONFLICT,
        )

    volume = pedido.volumes.filter(pk=volume_id).first()
    if not volume:
        return Response({'erro': 'volume não pertence ao pedido'}, status=http_status.HTTP_404_NOT_FOUND)
    if volume.fechado_em:
        return Response({'erro': 'volume já fechado'}, status=http_status.HTTP_400_BAD_REQUEST)

    from .caixas import avaliar_caixa_cheia, ocupacao_volume, volume_caixa
    divisor = volume_caixa()
    with transaction.atomic():
        # Trava a linha do item e confere o excesso DE NOVO (2026-11-23, NF 150739 fechou com
        # 1329 de 1316): a checagem lá em cima lê sem trava, e duas leituras simultâneas do
        # mesmo item (ou uma leitura junto com uma OP) passavam as duas.
        travado = PedidoItem.objects.select_for_update().get(pk=item.pk)
        # Leitura em dobro (2026-11-23): o coletor mandava o MESMO lançamento duas vezes com
        # 8–300 ms de diferença (Enter do leitor disparando duas vezes no modal de quantidade) —
        # 38 pares em produção desde 17/11. Mesmo item, volume, quantidade e código dentro de
        # JANELA_REPETICAO_MS: é a mesma leitura; responde ok sem lançar de novo. Uma segunda
        # leitura de verdade leva mais de 1 s (trava do mesmo código nos clientes).
        desde = timezone.now() - timedelta(milliseconds=JANELA_REPETICAO_MS)
        if VolumeItem.objects.filter(volume=volume, pedido_item=item, qtd=qtd, criado_em__gte=desde).exists():
            logger.info('bipar: leitura repetida ignorada', extra={'pedido': pedido.id, 'item': item.id, 'qtd': qtd})
            return Response({
                'resultado': 'ok', 'repetida': True, 'item_id': item.id,
                'qtd_separada': travado.qtd_separada, 'qtd_pedida': travado.qtd_pedida,
                'volume_id': volume.id, 'codigo_alternativo': bool(alias),
                'ocupacao_volume': round(ocupacao_volume(volume, divisor), 2), 'caixa_cheia': None,
            })
        if travado.qtd_separada + qtd > travado.qtd_pedida:
            return Response(
                {'resultado': 'excesso',
                 'qtd_pedida': travado.qtd_pedida,
                 'qtd_ja_separada': travado.qtd_separada,
                 'qtd_solicitada': qtd},
                status=http_status.HTTP_409_CONFLICT,
            )
        ocupacao_antes = ocupacao_volume(volume, divisor)
        VolumeItem.objects.create(volume=volume, pedido_item=item, qtd=qtd)
        item.qtd_separada = models.F('qtd_separada') + qtd
        item.save(update_fields=['qtd_separada'])
        item.refresh_from_db(fields=['qtd_separada'])
        ocupacao = ocupacao_volume(volume, divisor)
        caixa_cheia = avaliar_caixa_cheia(volume, ocupacao_antes, ocupacao)
        payload = {
            'item_id': item.id, 'sku': item.sku, 'qtd': qtd,
            'qtd_separada_total': item.qtd_separada, 'volume_id': volume.id,
        }
        if caixa_cheia:
            payload['caixa_cheia'] = caixa_cheia
        if alias:
            DivergenciaBarra.objects.create(
                pedido_item=item, codigo_bipado=codigo, qtd=qtd, alias=alias,
                observacao=f'código alternativo cadastrado ({alias.codigo_lido} → {alias.codigo_certo})',
            )
            payload.update({'codigo_lido': codigo, 'alias_id': alias.id})
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user, acao='item_bipado', payload=payload,
        )

    return Response({
        'resultado': 'ok',
        'item_id': item.id,
        'qtd_separada': item.qtd_separada,
        'qtd_pedida': item.qtd_pedida,
        'volume_id': volume.id,
        'codigo_alternativo': bool(alias),
        # fração da caixa padrão ocupada pelo volume; caixa_cheia só na leitura que passa de 1
        'ocupacao_volume': round(ocupacao, 2),
        'caixa_cheia': caixa_cheia,
    })


# ---------------------------------------------------------------------------
# Fardo fechado da fábrica — bipou a OP (só dígitos, < 13), lança o fardo inteiro
# ---------------------------------------------------------------------------

@api_view(['POST'])
def fardo(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err
    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não permite lançar fardo — inicie a conferência primeiro'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    try:
        volume, lancados = ler_fardo(pedido, request.data.get('op'), request.user)
    except FardoErro as e:
        return Response({'resultado': e.resultado, 'erro': e.mensagem, **e.dados}, status=e.status)

    return Response({
        'resultado': 'ok',
        'volume': _serializar_volume(volume),
        'itens': lancados,
        'pecas': sum(x['qtd'] for x in lancados),
    }, status=http_status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Remover lançamento de item dentro de um volume (corrige erro de bipagem)
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
def remover_volume_item(request, pk, volume_id, volume_item_id):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não permite editar volumes'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    volume = pedido.volumes.filter(pk=volume_id).first()
    if not volume:
        return Response({'erro': 'volume não pertence ao pedido'}, status=http_status.HTTP_404_NOT_FOUND)
    if volume.fechado_em:
        return Response({'erro': 'volume já fechado'}, status=http_status.HTTP_400_BAD_REQUEST)

    vi = volume.itens.filter(pk=volume_item_id).select_related('pedido_item').first()
    if not vi:
        return Response({'erro': 'lançamento não pertence ao volume'}, status=http_status.HTTP_404_NOT_FOUND)

    item = vi.pedido_item
    qtd_removida = vi.qtd

    with transaction.atomic():
        item.qtd_separada = models.F('qtd_separada') - qtd_removida
        item.save(update_fields=['qtd_separada'])
        item.refresh_from_db(fields=['qtd_separada'])
        if item.qtd_separada < 0:
            item.qtd_separada = 0
            item.save(update_fields=['qtd_separada'])

        vi.delete()

        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='volume_item_removido',
            payload={
                'volume_id': volume.id,
                'volume_item_id': volume_item_id,
                'item_id': item.id, 'sku': item.sku,
                'qtd_removida': qtd_removida,
                'qtd_separada_total': item.qtd_separada,
            },
        )

    return Response({
        'ok': True,
        'item_id': item.id,
        'qtd_separada': item.qtd_separada,
        'qtd_pedida': item.qtd_pedida,
        'volume_id': volume.id,
    })


# ---------------------------------------------------------------------------
# Remover volume vazio
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
def remover_volume(request, pk, volume_id):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não permite editar volumes'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    volume = pedido.volumes.filter(pk=volume_id).first()
    if not volume:
        return Response({'erro': 'volume não pertence ao pedido'}, status=http_status.HTTP_404_NOT_FOUND)
    if volume.op:
        # fardo da fábrica: sai inteiro, devolvendo as quantidades (desfazer a leitura)
        desfazer_fardo(pedido, volume, request.user)
        return Response({'ok': True})
    if volume.fechado_em:
        return Response({'erro': 'volume já fechado'}, status=http_status.HTTP_400_BAD_REQUEST)
    if volume.itens.exists():
        return Response(
            {'erro': 'volume tem itens — remova os lançamentos antes de apagar'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    volume.delete()
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='volume_removido',
        payload={'volume_id': volume_id, 'tipo': volume.tipo, 'identificador': volume.identificador},
    )
    return Response({'ok': True})


# ---------------------------------------------------------------------------
# Concluir conferência (Em conferência → Conferido, chama WS Senior placeholder)
# ---------------------------------------------------------------------------

_ROTULO_TIPO_VOLUME = {'caixa': 'Caixa', 'fardo': 'Fardo', 'outro': 'Volume'}


def _volumes_vazios(pedido: Pedido) -> list[tuple[Volume, str]]:
    """Volumes do pedido sem nenhum lançamento, com o rótulo que as telas mostram
    (`tituloVolume` do web/coletor: "Caixa 4" = 4º volume na ordem de criação)."""
    volumes = list(pedido.volumes.all().order_by('criado_em', 'id').prefetch_related('itens'))
    saida = []
    for indice, v in enumerate(volumes):
        if v.itens.exists():
            continue
        base = _ROTULO_TIPO_VOLUME.get(v.tipo, 'Volume')
        if v.op:
            rotulo = f'{base} OP {v.op}'
        elif v.identificador and v.identificador.lower().startswith(base.lower()):
            rotulo = v.identificador
        elif v.identificador:
            rotulo = f'{base} {v.identificador}'
        else:
            rotulo = f'{base} {indice + 1}'
        saida.append((v, rotulo))
    return saida


def _enviar_volumes_ao_senior(pedido: Pedido) -> tuple[bool, str]:
    """Placeholder — o WS exato ainda não foi definido.

    Quando definido, esta função deve enviar a lista de volumes do pedido para
    o ERP Senior e retornar (sucesso, mensagem_de_erro).
    """
    logger.info(
        f"[Senior WS PLACEHOLDER] {pedido.get_tipo_display()} {pedido.numero_externo} "
        f"(filial {pedido.codfil or '?'}{f', série {pedido.codsnf}' if pedido.codsnf else ''}) "
        f"com {pedido.volumes.count()} volume(s) — WS não configurado"
    )
    return True, ''


def _finalizar_conferido(pedido: Pedido, user) -> tuple[bool, str]:
    """Chama o WS Senior e marca o pedido como Conferido (+ log + sequência)."""
    agora = timezone.now()
    sucesso, msg_erro = _enviar_volumes_ao_senior(pedido)

    pedido.status = Pedido.Status.CONFERIDO
    pedido.conferido_em = agora
    pedido.senior_tentativas = (pedido.senior_tentativas or 0) + 1
    if sucesso:
        pedido.senior_atualizado_em = agora
        pedido.senior_ultimo_erro = ''
    else:
        pedido.senior_ultimo_erro = msg_erro

    pedido.save(update_fields=[
        'status', 'conferido_em',
        'senior_atualizado_em', 'senior_tentativas', 'senior_ultimo_erro',
    ])
    PedidoLog.objects.create(
        pedido=pedido, usuario=user,
        acao='conferencia_concluida',
        payload={'volumes_count': pedido.volumes.count(), 'senior_ok': sucesso},
    )
    if pedido.sequencia:
        pedido.sequencia.recalcular_status()

    # Etiqueta de volume (ponto 7, 2026-10-07): impressão automática na impressora
    # padrão, só com transportadora. O veredito volta para a tela do conferente.
    from apps.impressao.services import disparar_automatica
    try:
        etiqueta = disparar_automatica(pedido)
    except Exception:  # nunca derruba o concluir por causa da etiqueta
        logger.exception(f'etiqueta de volume: falha ao decidir impressão de {pedido}')
        etiqueta = {'resultado': 'erro', 'impressora': None}
    return sucesso, msg_erro, etiqueta


def _validar_sobras(pedido: Pedido, dados):
    """Body `sobras: [{item_id, qtd}]` → (lista de (item, qtd), erro)."""
    if not isinstance(dados, list):
        return None, Response({'erro': 'sobras deve ser uma lista'}, status=http_status.HTTP_400_BAD_REQUEST)
    itens = {i.id: i for i in pedido.itens.all()}
    resultado = []
    for s in dados:
        item = itens.get((s or {}).get('item_id'))
        try:
            qtd = int((s or {}).get('qtd'))
        except (TypeError, ValueError):
            qtd = 0
        if not item or qtd < 1:
            return None, Response(
                {'erro': 'sobra inválida — informe item_id do pedido e qtd maior que zero'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        resultado.append((item, qtd))
    return resultado, None


@api_view(['POST'])
def concluir(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(
        Pedido.objects.select_related('sequencia', 'separado_por').prefetch_related('itens', 'volumes'),
        pk=pk,
    )
    err = _guard_pedido(request, pedido)
    if err:
        return err

    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", esperado "conferindo"'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    pendentes = [
        i for i in pedido.itens.all()
        if i.status == PedidoItem.Status.OK and i.qtd_separada < i.qtd_pedida
    ]
    if pendentes:
        return Response(
            {'erro': f'{len(pendentes)} item(ns) ainda não totalmente conferidos',
             'itens_pendentes': [i.id for i in pendentes]},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if not pedido.volumes.exists():
        return Response(
            {'erro': 'pedido sem nenhum volume — abra ao menos um volume antes de concluir'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Volume vazio não conclui (2026-11-18): a NF 150297 saiu Conferida com uma "Caixa 4"
    # sem nenhum lançamento — ninguém viu e a etiqueta/cubagem não batem com as caixas
    # reais. O conferente apaga o volume (botão "Apagar volume" no web e no coletor) ou
    # lança os itens nele. O rótulo segue o das telas: tipo + identificador, ou tipo + posição.
    vazios = _volumes_vazios(pedido)
    if vazios:
        nomes = ', '.join(r for _, r in vazios)
        return Response(
            {'erro': f'{"volume vazio" if len(vazios) == 1 else "volumes vazios"}: {nomes} — '
                     'apague o volume ou lance itens nele antes de concluir',
             'volumes_vazios': [{'id': v.id, 'rotulo': r} for v, r in vazios]},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    # Sobras físicas (DESIGN.md §4.2) — registradas antes de decidir o desfecho
    sobras, err = _validar_sobras(pedido, request.data.get('sobras') or [])
    if err:
        return err

    if sobras:
        for item, qtd in sobras:
            ErroSeparacao.objects.create(
                pedido=pedido, pedido_item=item,
                tipo=ErroSeparacao.Tipo.A_MAIS, qtd=qtd,
                separador=pedido.separado_por, registrado_por=request.user,
            )
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='sobra_registrada',
            payload={'sobras': [{'item_id': i.id, 'sku': i.sku, 'qtd': q} for i, q in sobras]},
        )

        regra = Configuracao.obter(Configuracao.Chave.FECHAMENTO_SOBRA)
        if regra != 'conferente':
            # Default: quem fecha pedido com sobra é o Sup. Pátio — WS Senior só no fechamento
            pedido.status = Pedido.Status.AGUARDANDO_FECHAMENTO
            pedido.save(update_fields=['status'])
            PedidoLog.objects.create(
                pedido=pedido, usuario=request.user,
                acao='conferencia_aguardando_fechamento',
                payload={'qtd_sobras': len(sobras)},
            )
            if pedido.sequencia:
                pedido.sequencia.recalcular_status()
            return Response({
                'ok': True,
                'status': pedido.status,
                'aguardando_fechamento': True,
            })

    sucesso, msg_erro, etiqueta = _finalizar_conferido(pedido, request.user)
    return Response({
        'ok': True,
        'status': pedido.status,
        'senior_ok': sucesso,
        'senior_erro': msg_erro,
        'etiqueta': etiqueta,
    })


# ---------------------------------------------------------------------------
# Marcar como Não Conforme
# ---------------------------------------------------------------------------

@api_view(['POST'])
def marcar_nao_conforme(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err

    motivo = request.data.get('motivo', '').strip()
    detalhe = request.data.get('detalhe', '').strip()

    motivos_validos = [c[0] for c in Pedido.MotivoNaoConforme.choices]
    if motivo not in motivos_validos:
        return Response(
            {'erro': f'motivo inválido — use {", ".join(motivos_validos)}'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if pedido.status not in (Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO):
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não pode ir para Não Conforme'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    pedido.status = Pedido.Status.NAO_CONFORME
    pedido.nao_conforme_em = timezone.now()
    pedido.nao_conforme_motivo = motivo
    pedido.nao_conforme_detalhe = detalhe
    pedido.save(update_fields=[
        'status', 'nao_conforme_em', 'nao_conforme_motivo', 'nao_conforme_detalhe',
    ])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='pedido_nao_conforme',
        payload={'motivo': motivo, 'detalhe': detalhe},
    )

    # Faltas derivadas automaticamente (DESIGN.md §4.2): com motivo de quantidade
    # ou ausência, o que ficou sem bipar é o que o separador trouxe a menos.
    if motivo in (Pedido.MotivoNaoConforme.DIVERGENCIA_QTD, Pedido.MotivoNaoConforme.ITEM_AUSENTE):
        faltas = []
        for item in pedido.itens.all():
            if item.status == PedidoItem.Status.OK and item.qtd_separada < item.qtd_pedida:
                qtd_falta = item.qtd_pedida - item.qtd_separada
                ErroSeparacao.objects.create(
                    pedido=pedido, pedido_item=item,
                    tipo=ErroSeparacao.Tipo.A_MENOS, qtd=qtd_falta,
                    separador=pedido.separado_por, registrado_por=request.user,
                )
                faltas.append({'item_id': item.id, 'sku': item.sku, 'qtd': qtd_falta})
        if faltas:
            PedidoLog.objects.create(
                pedido=pedido, usuario=request.user,
                acao='falta_registrada', payload={'faltas': faltas},
            )

    if pedido.sequencia:
        pedido.sequencia.recalcular_status()
    return Response({
        'ok': True,
        'status': pedido.status,
        'motivo': motivo,
    })


# ---------------------------------------------------------------------------
# Divergência de barra — liberação pelo supervisor no web (DESIGN.md §4.1)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def liberar_divergencia(request, pk):
    """Mercadoria certa etiquetada errado: o supervisor digita a barra lida,
    vincula ao item correto e a bipagem passa — registrada para gestão.
    O vínculo vale só para esta ocorrência (nunca vira alias da barra)."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido.objects.prefetch_related('itens', 'volumes'), pk=pk)
    if pedido.status == Pedido.Status.CANCELADO:
        return _resposta_cancelado(pedido)
    if pedido.status != Pedido.Status.CONFERINDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}" — só é possível liberar durante a conferência'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    item_id = request.data.get('item_id')
    codigo = (request.data.get('codigo') or '').strip()
    observacao = (request.data.get('observacao') or '').strip()
    try:
        qtd = int(request.data.get('qtd'))
    except (TypeError, ValueError):
        qtd = 0

    if not item_id or not codigo or qtd < 1:
        return Response(
            {'erro': 'item_id, codigo e qtd (maior que zero) são obrigatórios'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    item = pedido.itens.filter(pk=item_id).first()
    if not item:
        return Response({'erro': 'item não pertence ao pedido'}, status=http_status.HTTP_404_NOT_FOUND)
    if item.status != PedidoItem.Status.OK:
        return Response({'erro': f'item está como "{item.status}"'}, status=http_status.HTTP_409_CONFLICT)

    if codigo == item.ean or codigo == item.sku:
        return Response(
            {'erro': 'o código bate com o item — não é divergência, bipe normalmente no coletor'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    from apps.pedidos.alias_barra import alias_para
    if alias_para(codigo, item):
        return Response(
            {'erro': 'este código já está cadastrado como alternativo do item — o coletor aceita direto, bipe normalmente'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    if item.qtd_separada + qtd > item.qtd_pedida:
        return Response(
            {'erro': 'quantidade excede o pedido',
             'qtd_pedida': item.qtd_pedida, 'qtd_ja_separada': item.qtd_separada},
            status=http_status.HTTP_409_CONFLICT,
        )

    volume = pedido.volumes.filter(fechado_em__isnull=True).order_by('criado_em').last()
    if not volume:
        return Response(
            {'erro': 'nenhum volume aberto — peça ao conferente para abrir um volume'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        travado = PedidoItem.objects.select_for_update().get(pk=item.pk)
        if travado.qtd_separada + qtd > travado.qtd_pedida:
            return Response(
                {'erro': 'quantidade excede o pedido',
                 'qtd_pedida': travado.qtd_pedida, 'qtd_ja_separada': travado.qtd_separada},
                status=http_status.HTTP_409_CONFLICT,
            )
        VolumeItem.objects.create(volume=volume, pedido_item=item, qtd=qtd)
        item.qtd_separada = models.F('qtd_separada') + qtd
        item.save(update_fields=['qtd_separada'])
        item.refresh_from_db(fields=['qtd_separada'])
        DivergenciaBarra.objects.create(
            pedido_item=item, codigo_bipado=codigo, qtd=qtd,
            vinculado_por=request.user, observacao=observacao,
        )
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='divergencia_liberada',
            payload={
                'item_id': item.id, 'sku': item.sku, 'codigo': codigo,
                'qtd': qtd, 'volume_id': volume.id, 'observacao': observacao,
            },
        )

    return Response({
        'resultado': 'ok',
        'item_id': item.id,
        'qtd_separada': item.qtd_separada,
        'qtd_pedida': item.qtd_pedida,
        'volume_id': volume.id,
    })


@api_view(['GET'])
def listar_divergencias(request):
    """Relatório de etiquetagem errada — insumo para cobrar a fábrica."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    qs = (
        DivergenciaBarra.objects
        .select_related('pedido_item__pedido', 'vinculado_por')
        .order_by('-criado_em')[:200]
    )
    return Response([
        {
            'id': d.id,
            'criado_em': d.criado_em,
            'codigo_bipado': d.codigo_bipado,
            'qtd': d.qtd,
            'observacao': d.observacao,
            # 'alias' = entrou pelo código alternativo cadastrado, sem ninguém liberar (2026-11-17)
            'origem': 'alias' if d.alias_id else 'supervisor',
            'vinculado_por': d.vinculado_por.username if d.vinculado_por else None,
            'sku': d.pedido_item.sku,
            'descricao': d.pedido_item.descricao,
            'ean': d.pedido_item.ean,
            'pedido_id': d.pedido_item.pedido_id,
            'tipo': d.pedido_item.pedido.tipo,
            'numero_externo': d.pedido_item.pedido.numero_externo,
        }
        for d in qs
    ])


# ---------------------------------------------------------------------------
# Relatório de erros de separação — sobras/faltas por separador (DESIGN.md §4.2)
# ---------------------------------------------------------------------------

@api_view(['GET'])
def listar_erros_separacao(request):
    """Histórico de sobras/faltas + ranking por separador (ciclo de qualidade)."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    def _parse_data(valor):
        from datetime import date
        try:
            return date.fromisoformat(valor) if valor else None
        except ValueError:
            return None

    data_inicio = _parse_data(request.query_params.get('data_inicio'))
    data_fim = _parse_data(request.query_params.get('data_fim'))

    base = ErroSeparacao.objects.all()
    if data_inicio:
        base = base.filter(criado_em__date__gte=data_inicio)
    if data_fim:
        base = base.filter(criado_em__date__lte=data_fim)

    # Ranking por separador — sempre sobre o período inteiro (ignora filtro de tipo)
    resumo_raw = (
        base.values('separador_id', 'separador__nome', 'separador__apelido')
        .annotate(
            sobras=models.Sum('qtd', filter=models.Q(tipo=ErroSeparacao.Tipo.A_MAIS)),
            faltas=models.Sum('qtd', filter=models.Q(tipo=ErroSeparacao.Tipo.A_MENOS)),
            ocorrencias=models.Count('id'),
        )
    )
    resumo = sorted(
        (
            {
                'separador_id': r['separador_id'],
                'nome': (r['separador__apelido'] or r['separador__nome'] or 'Não identificado'),
                'nao_identificado': r['separador_id'] is None,
                'sobras': r['sobras'] or 0,
                'faltas': r['faltas'] or 0,
                'total': (r['sobras'] or 0) + (r['faltas'] or 0),
                'ocorrencias': r['ocorrencias'],
            }
            for r in resumo_raw
        ),
        key=lambda x: -x['total'],
    )

    qs = base.select_related('pedido', 'pedido_item', 'separador', 'registrado_por')
    tipo = request.query_params.get('tipo')
    if tipo in (ErroSeparacao.Tipo.A_MAIS, ErroSeparacao.Tipo.A_MENOS):
        qs = qs.filter(tipo=tipo)
    separador_param = request.query_params.get('separador')
    if separador_param == 'nao_identificado':
        qs = qs.filter(separador__isnull=True)
    elif separador_param:
        qs = qs.filter(separador_id=separador_param)

    erros = [
        {
            'id': e.id,
            'criado_em': e.criado_em,
            'tipo': e.tipo,
            'qtd': e.qtd,
            'sku': e.pedido_item.sku if e.pedido_item else None,
            'descricao': e.pedido_item.descricao if e.pedido_item else None,
            'pedido_id': e.pedido_id,
            'tipo_doc': e.pedido.tipo,
            'numero_externo': e.pedido.numero_externo,
            'separador': str(e.separador) if e.separador else None,
            'registrado_por': e.registrado_por.username if e.registrado_por else None,
        }
        for e in qs.order_by('-criado_em')[:200]
    ]

    return Response({'resumo': resumo, 'erros': erros})


# ---------------------------------------------------------------------------
# Fechamento de pedidos com sobra — Sup. Pátio (DESIGN.md §4.2)
# ---------------------------------------------------------------------------

def _exige_patio_ou_admin(request):
    if request.user.perfil not in ('supervisor_patio', 'admin'):
        return Response(
            {'erro': 'restrito ao Supervisor de Pátio'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return None


@api_view(['GET'])
def listar_fechamentos(request):
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    qs = (
        Pedido.objects
        .filter(status=Pedido.Status.AGUARDANDO_FECHAMENTO)
        .select_related('conferente', 'separado_por', 'sequencia')
        .prefetch_related('erros_separacao__pedido_item')
        .order_by('conferencia_iniciada_em')
    )
    return Response([
        {
            'id': p.id,
            'tipo': p.tipo,
            'numero_externo': p.numero_externo,
            'cliente': p.cliente,
            'conferente': p.conferente.username if p.conferente else None,
            'separado_por': str(p.separado_por) if p.separado_por else None,
            'separador_nao_identificado': p.separador_nao_identificado,
            'sequencia_numero': p.sequencia.numero if p.sequencia else None,
            'sobras': [
                {
                    'sku': e.pedido_item.sku if e.pedido_item else None,
                    'descricao': e.pedido_item.descricao if e.pedido_item else None,
                    'qtd': e.qtd,
                }
                for e in p.erros_separacao.all()
                if e.tipo == ErroSeparacao.Tipo.A_MAIS
            ],
        }
        for p in qs
    ])


@api_view(['POST'])
def fechar_sobra(request, pk):
    err = _exige_patio_ou_admin(request)
    if err:
        return err

    pedido = get_object_or_404(
        Pedido.objects.select_related('sequencia').prefetch_related('volumes'),
        pk=pk,
    )
    if pedido.status == Pedido.Status.CANCELADO:
        return _resposta_cancelado(pedido)
    if pedido.status != Pedido.Status.AGUARDANDO_FECHAMENTO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", esperado "aguardando_fechamento"'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='sobra_fechada', payload={},
    )
    sucesso, msg_erro, etiqueta = _finalizar_conferido(pedido, request.user)
    return Response({
        'ok': True,
        'status': pedido.status,
        'senior_ok': sucesso,
        'senior_erro': msg_erro,
        'etiqueta': etiqueta,
    })


# ---------------------------------------------------------------------------
# Lista de Não Conformes — visualização e ações (sup_patio, sup_vendas, admin)
# ---------------------------------------------------------------------------

@api_view(['GET'])
def listar_nao_conformes(request):
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    qs = (
        Pedido.objects
        .filter(status=Pedido.Status.NAO_CONFORME)
        .select_related('conferente', 'atribuido_por', 'separado_por')
        .order_by('-nao_conforme_em')
    )
    motivos_label = dict(Pedido.MotivoNaoConforme.choices)
    return Response([
        {
            'id': p.id,
            'tipo': p.tipo,
            'numero_externo': p.numero_externo,
            'frete': p.frete,
            'transportadora': p.transportadora,
            'cliente': p.cliente,
            'criado_em': p.criado_em,
            'nao_conforme_em': p.nao_conforme_em,
            'motivo': p.nao_conforme_motivo,
            'motivo_label': motivos_label.get(p.nao_conforme_motivo, p.nao_conforme_motivo),
            'detalhe': p.nao_conforme_detalhe,
            'conferente': p.conferente.username if p.conferente else None,
            'atribuido_por': p.atribuido_por.username if p.atribuido_por else None,
            'separado_por': str(p.separado_por) if p.separado_por else None,
            'separador_nao_identificado': p.separador_nao_identificado,
        }
        for p in qs
    ])


@api_view(['POST'])
def cancelar_nao_conforme(request, pk):
    """Cancela definitivamente um pedido na lista de Não Conformes."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    if pedido.status != Pedido.Status.NAO_CONFORME:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", não está em Não Conforme'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    cancelar(
        pedido, Pedido.OrigemCancelamento.SUPERVISOR, usuario=request.user,
        payload={'motivo_anterior': pedido.nao_conforme_motivo},
    )
    return Response({'ok': True, 'status': pedido.status})


@api_view(['POST'])
def retornar_nao_conforme(request, pk):
    """Retorna o pedido para a fila de Pendentes (volta ao começo do fluxo)."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    if pedido.status != Pedido.Status.NAO_CONFORME:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", não está em Não Conforme'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    motivo_anterior = pedido.nao_conforme_motivo
    detalhe_anterior = pedido.nao_conforme_detalhe
    sequencia_anterior = pedido.sequencia

    pedido.status = Pedido.Status.PENDENTE
    pedido.selecionado_em = None
    pedido.selecionado_por = None
    pedido.atribuido_em = None
    pedido.atribuido_por = None
    pedido.sequencia = None
    pedido.conferente = None
    pedido.conferencia_iniciada_em = None
    pedido.separado_por = None
    pedido.separador_nao_identificado = False
    pedido.nao_conforme_em = None
    pedido.nao_conforme_motivo = ''
    pedido.nao_conforme_detalhe = ''
    pedido.save(update_fields=[
        'status', 'selecionado_em', 'selecionado_por',
        'atribuido_em', 'atribuido_por', 'sequencia', 'conferente', 'conferencia_iniciada_em',
        'separado_por', 'separador_nao_identificado',
        'nao_conforme_em', 'nao_conforme_motivo', 'nao_conforme_detalhe',
    ])
    if sequencia_anterior:
        sequencia_anterior.recalcular_status()
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='nao_conforme_retornado',
        payload={'motivo_anterior': motivo_anterior, 'detalhe_anterior': detalhe_anterior},
    )
    return Response({'ok': True, 'status': pedido.status})



# ---------------------------------------------------------------------------
# Relatório: Conferidos sem transportadora (2026-11-23)
# As notas que ainda precisam da transportadora (carta de correção, ou acerto no Senior) para a
# etiqueta de volume sair. Antes de listar, relê a transportadora no Senior — quem já foi
# acertado lá sai da lista na hora, mesmo fora da janela do beat. Só leitura no Senior.
# ---------------------------------------------------------------------------

@api_view(['GET'])
def relatorio_sem_transportadora(request):
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err
    from apps.impressao.services import anotar_volumes
    from apps.senior.tasks import atualizar_transportadoras

    base = Pedido.objects.filter(status=Pedido.Status.CONFERIDO, transportadora='')
    preenchidas = atualizar_transportadoras(list(base))

    documentos = []
    for p in anotar_volumes(base.select_related('conferente')).order_by('conferido_em', 'id'):
        documentos.append({
            'id': p.id,
            'tipo': p.tipo,
            'numero_externo': p.numero_externo,
            'pedidos_origem': p.pedidos_origem or [],
            'nf_numero': p.nf_numero,
            'cliente': p.cliente,
            'frete': p.frete,
            'frete_label': p.frete_label,
            'conferido_em': p.conferido_em,
            'conferente': p.conferente.username if p.conferente else None,
            # volumes com itens na conferência × `qtdemb` da nota (None = ainda não lido)
            'volumes': p.n_volumes,
            'nf_volumes': p.nf_volumes,
        })
    return Response({
        'gerado_em': timezone.now(),
        # False = o Oracle não respondeu; a lista usa a última leitura do beat
        'senior_consultado': preenchidas is not None,
        'preenchidas_agora': preenchidas or 0,
        'documentos': documentos,
    })


# ---------------------------------------------------------------------------
# Conferidos — "Devolver para Vendas" (admin, 2026-11-16)
# Conferência que não vale (teste, documento errado): o documento volta a Pendente
# como se nunca tivesse entrado no fluxo. Só admin, de propósito: apaga volumes e
# zera o separado; o rastro fica no PedidoLog (`conferido_retornado`).
# ---------------------------------------------------------------------------

@api_view(['POST'])
def devolver_conferido(request, pk):
    """Conferido → Pendente: apaga volumes, zera `qtd_separada`, limpa seleção, sequência,
    conferente, separador, campos do Senior e impressões da etiqueta (senão o botão diria
    "Reimprimir" e os beats não imprimiriam a próxima). Nada foi gravado no Senior (WS de
    volumes ainda é placeholder), então não há o que desfazer lá.
    """
    if request.user.perfil != 'admin':
        return Response({'erro': 'restrito ao Admin'}, status=http_status.HTTP_403_FORBIDDEN)

    with transaction.atomic():
        pedido = get_object_or_404(Pedido.objects.select_for_update(of=('self',)), pk=pk)
        if pedido.status != Pedido.Status.CONFERIDO:
            return Response(
                {'erro': f'pedido em status "{pedido.get_status_display()}", só Conferido pode ser devolvido'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        sequencia_anterior = pedido.sequencia
        payload = {
            'motivo': (request.data.get('motivo') or '').strip()[:500],
            'status_anterior': pedido.status,
            'conferido_em': pedido.conferido_em.isoformat() if pedido.conferido_em else None,
            'conferente': pedido.conferente.username if pedido.conferente else None,
            'sequencia': sequencia_anterior.numero if sequencia_anterior else None,
            'volumes_apagados': list(pedido.volumes.values_list('id', 'tipo', 'identificador', 'op')),
            'itens_zerados': list(pedido.itens.values_list('sku', 'qtd_separada')),
            'etiquetas_apagadas': pedido.impressoes_etiqueta.count(),
        }

        pedido.volumes.all().delete()
        pedido.itens.update(qtd_separada=0)
        pedido.impressoes_etiqueta.all().delete()

        pedido.status = Pedido.Status.PENDENTE
        pedido.selecionado_em = None
        pedido.selecionado_por = None
        pedido.atribuido_em = None
        pedido.atribuido_por = None
        pedido.sequencia = None
        pedido.conferente = None
        pedido.conferencia_iniciada_em = None
        pedido.separado_por = None
        pedido.separador_nao_identificado = False
        pedido.conferido_em = None
        pedido.senior_atualizado_em = None
        pedido.senior_tentativas = 0
        pedido.senior_ultimo_erro = ''
        pedido.save(update_fields=[
            'status', 'selecionado_em', 'selecionado_por',
            'atribuido_em', 'atribuido_por', 'sequencia', 'conferente', 'conferencia_iniciada_em',
            'separado_por', 'separador_nao_identificado', 'conferido_em',
            'senior_atualizado_em', 'senior_tentativas', 'senior_ultimo_erro',
        ])
        if sequencia_anterior:
            sequencia_anterior.recalcular_status()
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user, acao='conferido_retornado', payload=payload,
        )

    logger.info(
        f'{pedido} devolvido para Vendas por {request.user.username}',
        extra={'pedido': pedido.id, 'volumes': len(payload['volumes_apagados'])},
    )
    return Response({'ok': True, 'status': pedido.status})

# ---------------------------------------------------------------------------
# Mover lançamentos entre volumes depois da conferência (2026-11-19)
# O conferente esqueceu de abrir um volume novo e concluiu (ou registrou sobra) com tudo
# numa caixa só; antes a única saída era "Devolver para Vendas" e conferir tudo de novo.
# Sup. Pátio/admin, só web. Lançamento inteiro (sem dividir quantidade). Volume de OP
# (caixa/fardo lacrado da fábrica) não entra nem como origem nem como destino.
# ---------------------------------------------------------------------------

@api_view(['POST'])
def mover_lancamentos(request, pk):
    """`{volume_item_ids: [..], destino: {volume_id} | {novo: {tipo, identificador}}}`.
    Volume de origem que ficar vazio é apagado. Devolve os volumes atualizados e o bloqueio
    da etiqueta (volumes ≠ NF aparece sozinho se a conta mudou) — a etiqueta já impressa
    fica velha e precisa ser reimpressa pelo botão."""
    if request.user.perfil not in ('supervisor_patio', 'admin'):
        return Response({'erro': 'restrito ao Supervisor de Pátio'}, status=http_status.HTTP_403_FORBIDDEN)

    ids, destino, err = _ler_corpo_mover(request)
    if err:
        return err

    with transaction.atomic():
        pedido = get_object_or_404(Pedido.objects.select_for_update(of=('self',)), pk=pk)
        if pedido.status not in (Pedido.Status.CONFERIDO, Pedido.Status.AGUARDANDO_FECHAMENTO):
            return Response(
                {'erro': f'pedido em status "{pedido.get_status_display()}" — só Conferido ou Aguardando fechamento'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        err, alvo, movidos, apagados = _executar_mover(pedido, request.user, ids, destino, fechar_novo=True)
        if err:
            return err

    from apps.impressao.services import motivo_bloqueio
    from apps.pedidos.serializers import VolumeSerializer
    volumes = pedido.volumes.all().prefetch_related('itens').order_by('criado_em', 'id')
    logger.info(f'{pedido}: {len(movidos)} lançamento(s) movido(s) para volume {alvo.id} por {request.user.username}',
                extra={'pedido': pedido.id})
    return Response({
        'ok': True,
        'movidos': len(movidos),
        'destino_id': alvo.id,
        'volumes_apagados': [a['volume_id'] for a in apagados],
        'volumes': VolumeSerializer(volumes, many=True).data,
        'etiqueta_bloqueio': motivo_bloqueio(pedido),
        'etiqueta_impressa': pedido.impressoes_etiqueta.filter(status='ok').exists(),
    })


# Mover lançamentos DURANTE a conferência, pelo próprio conferente (2026-11-20): estão
# esquecendo de abrir a caixa nova e bipando tudo na mesma; em vez de apagar e bipar de novo,
# marca os lançamentos e manda para outro volume (ou um novo, que nasce aberto e vira o ativo
# na tela). Mesma regra do mover do Pátio: lançamento inteiro, OP não entra, origem vazia some.
@api_view(['POST'])
def mover_lancamentos_conferencia(request, pk):
    err = _exige_conferente(request)
    if err:
        return err
    ids, destino, err = _ler_corpo_mover(request)
    if err:
        return err

    with transaction.atomic():
        pedido = get_object_or_404(Pedido.objects.select_for_update(of=('self',)), pk=pk)
        err = _guard_pedido(request, pedido)
        if err:
            return err
        if pedido.status != Pedido.Status.CONFERINDO:
            return Response(
                {'erro': f'pedido em status "{pedido.status}" não permite editar volumes'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        err, alvo, movidos, apagados = _executar_mover(pedido, request.user, ids, destino, fechar_novo=False)
        if err:
            return err

    logger.info(f'{pedido}: conferente moveu {len(movidos)} lançamento(s) para volume {alvo.id}',
                extra={'pedido': pedido.id})
    return Response({
        'ok': True,
        'movidos': len(movidos),
        'destino_id': alvo.id,
        'volumes_apagados': [a['volume_id'] for a in apagados],
    })


def _ler_corpo_mover(request):
    ids = request.data.get('volume_item_ids') or []
    destino = request.data.get('destino') or {}
    if not isinstance(ids, list) or not ids or not all(isinstance(i, int) for i in ids):
        return None, None, Response({'erro': 'volume_item_ids obrigatório (lista de ids)'},
                                    status=http_status.HTTP_400_BAD_REQUEST)
    if not isinstance(destino, dict) or not (destino.get('volume_id') or destino.get('novo')):
        return None, None, Response({'erro': 'destino obrigatório: {volume_id} ou {novo: {tipo, identificador}}'},
                                    status=http_status.HTTP_400_BAD_REQUEST)
    return ids, destino, None


def _executar_mover(pedido, usuario, ids, destino, *, fechar_novo):
    """Dentro de transaction.atomic com o pedido travado. Devolve (erro, alvo, movidos, apagados).
    `fechar_novo`: volume novo nasce fechado (depois da conferência) ou aberto (durante)."""
    def falha(msg):
        return Response({'erro': msg}, status=http_status.HTTP_400_BAD_REQUEST), None, [], []

    lancamentos = list(
        VolumeItem.objects.select_related('volume', 'pedido_item')
        .filter(pk__in=ids, volume__pedido=pedido)
    )
    if len(lancamentos) != len(set(ids)):
        return falha('algum lançamento não pertence a este documento')
    if any(vi.volume.op for vi in lancamentos):
        return falha('lançamento de caixa/fardo da fábrica (OP) não pode ser movido')

    criado_novo = False
    if destino.get('volume_id'):
        alvo = pedido.volumes.filter(pk=destino['volume_id']).first()
        if not alvo:
            return falha('volume de destino não pertence ao documento')
        if alvo.op:
            return falha('não dá para mover para caixa/fardo da fábrica (OP)')
    else:
        novo = destino.get('novo') or {}
        tipo = str(novo.get('tipo') or Volume.Tipo.CAIXA)
        if tipo not in Volume.Tipo.values:
            return falha(f'tipo de volume inválido: {tipo}')
        alvo = Volume.objects.create(
            pedido=pedido, tipo=tipo, identificador=str(novo.get('identificador') or '').strip()[:100],
            criado_por=usuario, fechado_em=timezone.now() if fechar_novo else None,
        )
        criado_novo = True

    if all(vi.volume_id == alvo.id for vi in lancamentos):
        return falha('os lançamentos já estão nesse volume')

    origens = {}
    movidos = []
    for vi in lancamentos:
        if vi.volume_id == alvo.id:
            continue
        origens[vi.volume_id] = vi.volume
        movidos.append({'volume_item_id': vi.id, 'sku': vi.pedido_item.sku, 'qtd': vi.qtd,
                        'de': vi.volume_id, 'para': alvo.id})
        vi.volume = alvo
        vi.save(update_fields=['volume'])

    apagados = []
    for v in origens.values():
        if not v.itens.exists():
            apagados.append({'volume_id': v.id, 'tipo': v.tipo, 'identificador': v.identificador})
            v.delete()

    PedidoLog.objects.create(
        pedido=pedido, usuario=usuario, acao='volumes_reorganizados',
        payload={'movidos': movidos, 'destino': {'volume_id': alvo.id, 'tipo': alvo.tipo,
                                                 'identificador': alvo.identificador, 'novo': criado_novo},
                 'volumes_apagados': apagados, 'durante_conferencia': not fechar_novo},
    )
    return None, alvo, movidos, apagados


# ---------------------------------------------------------------------------
# Lista de Cancelados — transferência de conferência (2026-09-30)
# Documento cancelado no Senior (ou pelo supervisor) com volumes já montados:
# o Sup. Pátio aponta o documento reemitido e a conferência é transferida.
# ---------------------------------------------------------------------------

def _serializar_cancelado(p: Pedido) -> dict:
    status_label = dict(Pedido.Status.choices)
    return {
        'id': p.id,
        'tipo': p.tipo,
        'numero_externo': p.numero_externo,
        'codfil': p.codfil,
        'codsnf': p.codsnf,
        'frete': p.frete,
        'transportadora': p.transportadora,
        'cliente': p.cliente,
        'criado_em': p.criado_em,
        'cancelado_em': p.cancelado_em,
        'cancelado_origem': p.cancelado_origem,
        'cancelado_origem_label': p.get_cancelado_origem_display() if p.cancelado_origem else '',
        'status_anterior': p.status_anterior,
        'status_anterior_label': status_label.get(p.status_anterior, p.status_anterior),
        'sequencia': {'id': p.sequencia.id, 'numero': p.sequencia.numero, 'descricao': p.sequencia.descricao} if p.sequencia else None,
        'conferente': p.conferente.username if p.conferente else None,
        'separado_por': str(p.separado_por) if p.separado_por else None,
        'qtd_itens': p.qtd_itens,
        'qtd_volumes': p.qtd_volumes,
        'tem_conferencia': p.status_anterior in STATUS_COM_CONFERENCIA,
        'transferido_para': (
            {
                'id': p.transferido_para.id,
                'tipo': p.transferido_para.tipo,
                'numero_externo': p.transferido_para.numero_externo,
                'status': p.transferido_para.status,
            }
            if p.transferido_para else None
        ),
    }


# Status anteriores em que existe conferência (volumes, apontamento) a transferir.
# Pendente/Selecionado cancelados são só ruído para o supervisor — não entram na lista.
STATUS_COM_CONFERENCIA = (
    Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO, Pedido.Status.AGUARDANDO_FECHAMENTO,
    Pedido.Status.NAO_CONFORME, Pedido.Status.CONFERIDO,
)


@api_view(['GET'])
def listar_cancelados(request):
    """Cancelados que tinham conferência; os ainda não transferidos vêm primeiro."""
    err = _exige_supervisor_ou_admin(request)
    if err:
        return err

    qs = (
        Pedido.objects
        .filter(status=Pedido.Status.CANCELADO, status_anterior__in=STATUS_COM_CONFERENCIA)
        .select_related('conferente', 'separado_por', 'sequencia', 'transferido_para')
        .annotate(
            qtd_itens=models.Count('itens', distinct=True),
            qtd_volumes=models.Count('volumes', distinct=True),
        )
        .order_by('-cancelado_em')
    )
    dados = [_serializar_cancelado(p) for p in qs]
    dados.sort(key=lambda d: d['transferido_para'] is not None)
    return Response(dados)


@api_view(['GET'])
def buscar_destino_transferencia(request, pk):
    """Candidatos a destino: documentos Pendente/Selecionado cujo número contém `q`.

    Devolve a comparação de itens de cada candidato para a tela mostrar se bate.
    """
    err = _exige_patio_ou_admin(request)
    if err:
        return err

    origem = get_object_or_404(Pedido.objects.prefetch_related('itens'), pk=pk)
    q = (request.query_params.get('q') or '').strip()
    if not q:
        return Response([])

    candidatos = (
        Pedido.objects
        .filter(status__in=STATUS_DESTINO_TRANSFERENCIA, numero_externo__icontains=q)
        .exclude(pk=origem.pk)
        .prefetch_related('itens')
        .order_by('-criado_em')[:10]
    )
    return Response([
        {
            'id': c.id,
            'tipo': c.tipo,
            'numero_externo': c.numero_externo,
            'codfil': c.codfil,
            'codsnf': c.codsnf,
            'cliente': c.cliente,
            'status': c.status,
            'criado_em': c.criado_em,
            'comparacao': comparar_itens(origem, c),
        }
        for c in candidatos
    ])


@api_view(['POST'])
def transferir_conferencia(request, pk):
    """Transfere a conferência do cancelado `pk` para `destino_id` (Sup. Pátio ou admin)."""
    err = _exige_patio_ou_admin(request)
    if err:
        return err

    origem = get_object_or_404(Pedido, pk=pk)
    destino_id = request.data.get('destino_id')
    if not destino_id:
        return Response({'erro': 'destino_id é obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)
    destino = get_object_or_404(Pedido, pk=destino_id)

    try:
        destino = transferir(origem, destino, request.user)
    except TransferenciaInvalida as exc:
        return Response(
            {'erro': exc.erro, 'comparacao': exc.comparacao},
            status=http_status.HTTP_409_CONFLICT,
        )

    return Response({
        'ok': True,
        'destino': {
            'id': destino.id,
            'tipo': destino.tipo,
            'numero_externo': destino.numero_externo,
            'status': destino.status,
            'sequencia': (
                {'id': destino.sequencia.id, 'numero': destino.sequencia.numero, 'descricao': destino.sequencia.descricao}
                if destino.sequencia else None
            ),
        },
    })


# ---------------------------------------------------------------------------
# Ponto 4 da diretoria (leitura B, 2026-10-06): o conferente bipa a nota e pega o pedido
# ---------------------------------------------------------------------------

def _opcao(p):
    return {
        'id': p.id, 'tipo': p.tipo, 'numero_externo': p.numero_externo, 'codsnf': p.codsnf,
        'nf_numero': p.nf_numero, 'cliente': p.cliente, 'status': p.status, 'status_label': p.get_status_display(),
        'conferente': p.conferente.username if p.conferente else None,
        'sequencia': {'id': p.sequencia.id, 'numero': p.sequencia.numero, 'descricao': p.sequencia.descricao} if p.sequencia else None,
    }


@api_view(['POST'])
def devolver_atribuicao(request, pk):
    """Conferente devolve um documento que está Atribuído a ele (pegou sem querer, ou o
    Pátio atribuiu por engano — 2026-11-19). Só antes de abrir volume: volta a Selecionado,
    continua na sequência, sem conferente; o Pátio reatribui ou outro conferente pega."""
    err = _exige_conferente(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    err = _guard_pedido(request, pedido)
    if err:
        return err
    if pedido.status != Pedido.Status.ATRIBUIDO:
        return Response(
            {'erro': 'só dá para devolver documento Atribuído que ainda não começou a conferência'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )
    if pedido.volumes.exists():
        return Response({'erro': 'documento já tem volume — não dá mais para devolver'},
                        status=http_status.HTTP_400_BAD_REQUEST)
    anterior = pedido.conferente
    with transaction.atomic():
        pedido.status = Pedido.Status.SELECIONADO
        pedido.conferente = None
        pedido.atribuido_em = None
        pedido.atribuido_por = None
        pedido.save(update_fields=['status', 'conferente', 'atribuido_em', 'atribuido_por'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='atribuicao_devolvida',
            payload={'conferente': anterior.username if anterior else None,
                     'sequencia_id': pedido.sequencia_id,
                     'numero': pedido.sequencia.numero if pedido.sequencia else None},
        )
    return Response({'ok': True, 'status': pedido.status})


@api_view(['POST'])
def pegar_documento(request):
    """
    `{codigo}` (chave do DANFE, número da NF ou do pedido) ou `{pedido_id}` (quando o
    código deu mais de um documento). Resultados:
      - `aberto`: o documento já é deste conferente → o cliente abre a tela dele;
      - `atribuido`: estava sequenciado sem conferente → passou a ser dele agora
        (Selecionado → Atribuído, log `pedido_atribuido` com `via: bipagem`);
      - 404 `nao_encontrado`; 409 `ambiguo` (com `opcoes`), `outro_conferente`,
        `trava` (sequência ativa), `indisponivel` (não selecionado, sem sequência,
        cancelado, já finalizado).
    O Pátio continua montando as sequências; a atribuição à mão segue existindo.
    """
    err = _exige_conferente(request)
    if err:
        return err

    codigo = str(request.data.get('codigo') or '').strip()
    pedido_id = request.data.get('pedido_id')
    aviso = ''
    if pedido_id:
        cands = list(Pedido.objects.filter(pk=pedido_id).select_related('conferente', 'sequencia'))
    else:
        numero, serie, veio_de_chave = _interpretar_codigo(codigo)
        if not numero:
            return Response({'erro': 'código vazio'}, status=http_status.HTTP_400_BAD_REQUEST)
        cands = _candidatos_por_codigo(numero, serie, veio_de_chave)
        if not cands and veio_de_chave:
            aviso = _vincular_nf_da_chave(numero, serie)
            cands = _candidatos_por_codigo(numero, serie, veio_de_chave)

    if not cands:
        return Response(
            {'resultado': 'nao_encontrado', 'erro': aviso or 'documento não encontrado no Separa'},
            status=http_status.HTTP_404_NOT_FOUND,
        )
    if len(cands) > 1:
        return Response(
            {'resultado': 'ambiguo', 'erro': 'mais de um documento com esse número — escolha',
             'opcoes': [_opcao(p) for p in cands]},
            status=http_status.HTTP_409_CONFLICT,
        )

    pedido = cands[0]
    user = request.user

    if pedido.status == Pedido.Status.CANCELADO:
        return Response(
            {'resultado': 'indisponivel', 'erro': 'documento cancelado no Senior'},
            status=http_status.HTTP_409_CONFLICT,
        )

    if pedido.status in STATUS_PENDENTES:
        if pedido.conferente_id == user.id or user.perfil == 'admin':
            if pedido.status == Pedido.Status.ATRIBUIDO and pedido.sequencia_id:
                trava = _trava_para_pegar(user, pedido.sequencia)
                if trava:
                    return Response({'resultado': 'trava', 'erro': trava}, status=http_status.HTTP_409_CONFLICT)
            return Response({'resultado': 'aberto', 'pedido': _serializar_pedido(pedido)})
        quem = pedido.conferente.username if pedido.conferente else 'outro conferente'
        return Response(
            {'resultado': 'outro_conferente', 'erro': f'já está com {quem}'},
            status=http_status.HTTP_409_CONFLICT,
        )

    if pedido.status == Pedido.Status.PENDENTE:
        return Response(
            {'resultado': 'indisponivel', 'erro': 'ainda não foi selecionado para separação (Sup. Vendas)'},
            status=http_status.HTTP_409_CONFLICT,
        )
    if pedido.status != Pedido.Status.SELECIONADO:
        return Response(
            {'resultado': 'indisponivel', 'erro': f'documento já está em "{pedido.get_status_display()}"'},
            status=http_status.HTTP_409_CONFLICT,
        )
    if not pedido.sequencia_id:
        return Response(
            {'resultado': 'indisponivel', 'erro': 'ainda não entrou em sequência — fale com o Pátio'},
            status=http_status.HTTP_409_CONFLICT,
        )

    trava = _trava_para_pegar(user, pedido.sequencia)
    if trava:
        return Response({'resultado': 'trava', 'erro': trava}, status=http_status.HTTP_409_CONFLICT)

    # Dois coletores bipando a mesma nota: o primeiro leva, o segundo recebe 409.
    with transaction.atomic():
        # of=('self',): o FOR UPDATE não pode pegar o lado nulo do join com sequencia
        pedido = Pedido.objects.select_for_update(of=('self',)).select_related('sequencia').get(pk=pedido.pk)
        if pedido.status != Pedido.Status.SELECIONADO or pedido.conferente_id:
            quem = pedido.conferente.username if pedido.conferente else 'outro conferente'
            return Response(
                {'resultado': 'outro_conferente', 'erro': f'já está com {quem}'},
                status=http_status.HTTP_409_CONFLICT,
            )
        pedido.status = Pedido.Status.ATRIBUIDO
        pedido.conferente = user
        pedido.atribuido_em = timezone.now()
        pedido.atribuido_por = user
        pedido.save(update_fields=['status', 'conferente', 'atribuido_em', 'atribuido_por'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=user,
            acao='pedido_atribuido',
            payload={
                'conferente_id': user.id, 'conferente': user.username,
                'sequencia_id': pedido.sequencia.id, 'numero': pedido.sequencia.numero,
                'reatribuicao': False, 'via': 'bipagem', 'codigo': codigo[:60],
            },
        )
    pedido = Pedido.objects.select_related('sequencia', 'separado_por').prefetch_related('itens').get(pk=pedido.pk)
    return Response({'resultado': 'atribuido', 'pedido': _serializar_pedido(pedido)})

