"""Sequências de separação — fluxo do Sup. Pátio (DESIGN.md §3).

O pátio agrupa pedidos SELECIONADOS em sequências e atribui pedido a pedido a
conferentes dentro delas (push — a supervisora decide quem pega o quê). Tudo
passa por sequência; a antiga atribuição direta foi desativada.
"""
from django.db import transaction
from django.db.models import Count, Max, Q, Sum
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import User
from apps.pedidos.models import Pedido, PedidoLog, Sequencia, Volume, VolumeItem

STATUS_FINAIS = (
    Pedido.Status.CONFERIDO, Pedido.Status.NAO_CONFORME,
    Pedido.Status.CANCELADO, Pedido.Status.AGUARDANDO_FECHAMENTO,
)


def _exige_patio(request):
    if request.user.perfil not in ('supervisor_patio', 'admin'):
        return Response(
            {'erro': 'restrito ao Supervisor de Pátio'},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return None


def _com_contagens(qs):
    return qs.annotate(
        qtd_pedidos=Count('pedidos'),
        qtd_sem_conferente=Count('pedidos', filter=Q(pedidos__status=Pedido.Status.SELECIONADO)),
        qtd_pendentes=Count('pedidos', filter=Q(
            pedidos__status__in=[Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO]
        )),
        qtd_finalizados=Count('pedidos', filter=Q(pedidos__status__in=STATUS_FINAIS)),
    )


def _serializar_sequencia(seq) -> dict:
    return {
        'id': seq.id,
        'numero': seq.numero,
        'status': seq.status,
        'criado_em': seq.criado_em,
        'concluida_em': seq.concluida_em,
        'qtd_pedidos': getattr(seq, 'qtd_pedidos', None),
        'qtd_sem_conferente': getattr(seq, 'qtd_sem_conferente', None),
        'qtd_pendentes': getattr(seq, 'qtd_pendentes', None),
        'qtd_finalizados': getattr(seq, 'qtd_finalizados', None),
    }


def _adicionar_pedidos(seq: Sequencia, ids: list, user) -> tuple[list, list]:
    """Coloca pedidos SELECIONADOS e sem sequência dentro da sequência."""
    qs = Pedido.objects.filter(
        pk__in=ids, status=Pedido.Status.SELECIONADO, sequencia__isnull=True,
    )
    adicionados = list(qs.values_list('id', flat=True))
    qs.update(sequencia=seq)
    for pid in adicionados:
        PedidoLog.objects.create(
            pedido_id=pid, usuario=user,
            acao='pedido_sequenciado',
            payload={'sequencia_id': seq.id, 'numero': seq.numero},
        )
    ignorados = [i for i in ids if i not in adicionados]
    return adicionados, ignorados


# ---------------------------------------------------------------------------
# Listar / criar
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
def listar_ou_criar(request):
    err = _exige_patio(request)
    if err:
        return err

    if request.method == 'POST':
        ids = request.data.get('pedido_ids') or []
        if not isinstance(ids, list):
            return Response({'erro': 'pedido_ids deve ser uma lista'}, status=http_status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            numero = (Sequencia.objects.aggregate(m=Max('numero'))['m'] or 0) + 1
            seq = Sequencia.objects.create(numero=numero, criado_por=request.user)
            adicionados, ignorados = _adicionar_pedidos(seq, ids, request.user)

        seq = _com_contagens(Sequencia.objects.filter(pk=seq.pk)).first()
        dados = _serializar_sequencia(seq)
        dados.update({'adicionados': adicionados, 'ignorados': ignorados})
        return Response(dados, status=http_status.HTTP_201_CREATED)

    # GET — por padrão só abertas/em andamento; ?status=concluida traz as concluídas
    status_filtro = (request.query_params.get('status') or '').strip()
    qs = _com_contagens(Sequencia.objects.all()).order_by('-criado_em')
    if status_filtro:
        qs = qs.filter(status=status_filtro)
    else:
        qs = qs.exclude(status=Sequencia.Status.CONCLUIDA)
    return Response([_serializar_sequencia(s) for s in qs[:100]])


# ---------------------------------------------------------------------------
# Detalhe / excluir
# ---------------------------------------------------------------------------

@api_view(['GET', 'DELETE'])
def detalhe_ou_excluir(request, pk):
    err = _exige_patio(request)
    if err:
        return err

    seq = get_object_or_404(_com_contagens(Sequencia.objects.all()), pk=pk)

    if request.method == 'DELETE':
        if seq.status != Sequencia.Status.ABERTA or seq.pedidos.exists():
            return Response(
                {'erro': 'só é possível excluir sequência aberta e vazia'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        seq.delete()
        return Response({'ok': True})

    pedidos = (
        seq.pedidos
        .select_related('conferente')
        .annotate(qtd_itens=Count('itens'))
        .order_by('atribuido_em', 'criado_em')
    )
    dados = _serializar_sequencia(seq)
    dados['pedidos'] = [
        {
            'id': p.id,
            'numero_externo': p.numero_externo,
            'cliente': p.cliente,
            'status': p.status,
            'conferente': p.conferente_id,
            'conferente_username': p.conferente.username if p.conferente else None,
            'atribuido_em': p.atribuido_em,
            'qtd_itens': p.qtd_itens,
        }
        for p in pedidos
    ]
    return Response(dados)


# ---------------------------------------------------------------------------
# Adicionar / remover pedidos (permitido em sequência não concluída, com log)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def adicionar(request, pk):
    err = _exige_patio(request)
    if err:
        return err

    seq = get_object_or_404(Sequencia, pk=pk)
    if seq.status == Sequencia.Status.CONCLUIDA:
        return Response({'erro': 'sequência já concluída'}, status=http_status.HTTP_400_BAD_REQUEST)

    ids = request.data.get('pedido_ids') or []
    if not isinstance(ids, list) or not ids:
        return Response({'erro': 'pedido_ids obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

    adicionados, ignorados = _adicionar_pedidos(seq, ids, request.user)
    return Response({'adicionados': adicionados, 'ignorados': ignorados})


@api_view(['POST'])
def remover(request, pk):
    err = _exige_patio(request)
    if err:
        return err

    seq = get_object_or_404(Sequencia, pk=pk)
    ids = request.data.get('pedido_ids') or []
    if not isinstance(ids, list) or not ids:
        return Response({'erro': 'pedido_ids obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

    removidos = []
    with transaction.atomic():
        # Só sai da sequência quem ainda não entrou em conferência.
        for pedido in seq.pedidos.filter(
            pk__in=ids, status__in=[Pedido.Status.SELECIONADO, Pedido.Status.ATRIBUIDO],
        ):
            campos = ['sequencia']
            if pedido.status == Pedido.Status.ATRIBUIDO:
                # Desatribui: fora da sequência não existe atribuição (tudo via sequência)
                pedido.status = Pedido.Status.SELECIONADO
                pedido.conferente = None
                pedido.atribuido_em = None
                pedido.atribuido_por = None
                campos += ['status', 'conferente', 'atribuido_em', 'atribuido_por']
            pedido.sequencia = None
            pedido.save(update_fields=campos)
            PedidoLog.objects.create(
                pedido=pedido, usuario=request.user,
                acao='pedido_removido_sequencia',
                payload={'sequencia_id': seq.id, 'numero': seq.numero},
            )
            removidos.append(pedido.id)

    seq.recalcular_status()
    ignorados = [i for i in ids if i not in removidos]
    return Response({'removidos': removidos, 'ignorados': ignorados})


# ---------------------------------------------------------------------------
# Relatório agrupado por sequência (DESIGN.md §4.3) — produto × tipo de volume
# ---------------------------------------------------------------------------

@api_view(['GET'])
def relatorio(request, pk):
    """Total de cada produto por tipo de volume na sequência. Consumidor: diretor."""
    if request.user.perfil not in ('supervisor_patio', 'supervisor_vendas', 'admin'):
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)

    seq = get_object_or_404(Sequencia, pk=pk)

    agregados = (
        VolumeItem.objects
        .filter(volume__pedido__sequencia=seq)
        .values('pedido_item__sku', 'pedido_item__descricao', 'volume__tipo')
        .annotate(total=Sum('qtd'))
    )

    por_produto: dict = {}
    for linha in agregados:
        sku = linha['pedido_item__sku']
        row = por_produto.setdefault(sku, {
            'sku': sku,
            'descricao': linha['pedido_item__descricao'],
            'caixa': 0, 'fardo': 0, 'outro': 0, 'total': 0,
        })
        row[linha['volume__tipo']] += linha['total']
        row['total'] += linha['total']

    linhas = sorted(por_produto.values(), key=lambda r: (r['descricao'] or '', r['sku']))
    totais = {
        'caixa': sum(r['caixa'] for r in linhas),
        'fardo': sum(r['fardo'] for r in linhas),
        'outro': sum(r['outro'] for r in linhas),
        'total': sum(r['total'] for r in linhas),
    }
    volumes = {
        v['tipo']: v['n']
        for v in Volume.objects.filter(pedido__sequencia=seq).values('tipo').annotate(n=Count('id'))
    }

    return Response({
        'sequencia': {
            'id': seq.id, 'numero': seq.numero, 'status': seq.status,
            'criado_em': seq.criado_em, 'concluida_em': seq.concluida_em,
        },
        'linhas': linhas,
        'totais': totais,
        'volumes': volumes,
    })


# ---------------------------------------------------------------------------
# Atribuir pedidos da sequência a um conferente (Selecionado → Atribuído)
# ---------------------------------------------------------------------------

@api_view(['POST'])
def atribuir(request, pk):
    err = _exige_patio(request)
    if err:
        return err

    seq = get_object_or_404(Sequencia, pk=pk)
    if seq.status == Sequencia.Status.CONCLUIDA:
        return Response({'erro': 'sequência já concluída'}, status=http_status.HTTP_400_BAD_REQUEST)

    ids = request.data.get('pedido_ids') or []
    conferente_id = request.data.get('conferente_id')
    if not isinstance(ids, list) or not ids:
        return Response({'erro': 'pedido_ids obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)
    if not conferente_id:
        return Response({'erro': 'conferente_id obrigatório'}, status=http_status.HTTP_400_BAD_REQUEST)

    conferente = User.objects.filter(
        pk=conferente_id, perfil=User.Perfil.CONFERENTE, is_active=True,
    ).first()
    if not conferente:
        return Response({'erro': 'conferente inválido ou inativo'}, status=http_status.HTTP_400_BAD_REQUEST)

    agora = timezone.now()
    atribuidos = []
    with transaction.atomic():
        # Aceita Selecionado (1ª atribuição) e Atribuído (reatribuição antes de iniciar)
        for pedido in seq.pedidos.filter(
            pk__in=ids, status__in=[Pedido.Status.SELECIONADO, Pedido.Status.ATRIBUIDO],
        ):
            reatribuicao = pedido.conferente_id is not None
            pedido.status = Pedido.Status.ATRIBUIDO
            pedido.conferente = conferente
            pedido.atribuido_em = agora
            pedido.atribuido_por = request.user
            pedido.save(update_fields=['status', 'conferente', 'atribuido_em', 'atribuido_por'])
            PedidoLog.objects.create(
                pedido=pedido, usuario=request.user,
                acao='pedido_atribuido',
                payload={
                    'conferente_id': conferente.id, 'conferente': conferente.username,
                    'sequencia_id': seq.id, 'numero': seq.numero,
                    'reatribuicao': reatribuicao,
                },
            )
            atribuidos.append(pedido.id)

    ignorados = [i for i in ids if i not in atribuidos]
    return Response({
        'atribuidos': atribuidos,
        'ignorados': ignorados,
        'conferente': conferente.username,
    })
