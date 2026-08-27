import logging
from django.db import models, transaction
from django.utils import timezone
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.pedidos.models import (
    Pedido, PedidoItem, PedidoLog, Volume, VolumeItem,
)

logger = logging.getLogger(__name__)


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


def _serializar_volume(v: Volume) -> dict:
    return {
        'id': v.id,
        'tipo': v.tipo,
        'identificador': v.identificador,
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
    itens = list(p.itens.all())
    total_pedido = sum(i.qtd_pedida for i in itens if i.status == PedidoItem.Status.OK)
    total_conferido = sum(i.qtd_separada for i in itens if i.status == PedidoItem.Status.OK)
    percent = round(total_conferido / total_pedido * 100, 1) if total_pedido else 0

    dados = {
        'id': p.id,
        'numero_externo': p.numero_externo,
        'cliente': p.cliente,
        'status': p.status,
        'criado_em': p.criado_em,
        'atribuido_em': p.atribuido_em,
        'conferencia_iniciada_em': p.conferencia_iniciada_em,
        'qtd_itens': len(itens),
        'percent_conferido': percent,
        'itens': [
            {
                'id': i.id, 'sku': i.sku, 'descricao': i.descricao, 'ean': i.ean,
                'qtd_pedida': i.qtd_pedida, 'qtd_separada': i.qtd_separada,
                'status': i.status,
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
    err = _exige_conferente(request)
    if err:
        return err

    qs = (
        Pedido.objects
        .filter(
            conferente=request.user,
            status__in=[Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO],
        )
        .prefetch_related('itens')
        .order_by('-atribuido_em', '-criado_em')
    )
    return Response([_serializar_pedido(p) for p in qs])


# ---------------------------------------------------------------------------
# Detalhe — inclui volumes existentes
# ---------------------------------------------------------------------------

@api_view(['GET'])
def detalhe(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(
        Pedido.objects.prefetch_related('itens', 'volumes__itens'),
        pk=pk,
    )
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

    if pedido.status == Pedido.Status.CONFERINDO:
        return Response({'ok': True, 'ja_iniciado': True})
    if pedido.status != Pedido.Status.ATRIBUIDO:
        return Response(
            {'erro': f'pedido em status "{pedido.status}", esperado "atribuido"'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    pedido.status = Pedido.Status.CONFERINDO
    pedido.conferencia_iniciada_em = timezone.now()
    pedido.save(update_fields=['status', 'conferencia_iniciada_em'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='conferencia_iniciada', payload={},
    )
    return Response({'ok': True, 'conferencia_iniciada_em': pedido.conferencia_iniciada_em})


# ---------------------------------------------------------------------------
# Volumes — criar
# ---------------------------------------------------------------------------

@api_view(['POST'])
def criar_volume(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

    if pedido.status not in (Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO):
        return Response(
            {'erro': f'pedido em status "{pedido.status}" não permite criar volume'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    tipo = request.data.get('tipo', '').strip()
    if tipo not in (Volume.Tipo.CAIXA, Volume.Tipo.FARDO, Volume.Tipo.OUTRO):
        return Response({'erro': 'tipo inválido (caixa, fardo ou outro)'}, status=http_status.HTTP_400_BAD_REQUEST)

    identificador = (request.data.get('identificador') or '').strip()

    with transaction.atomic():
        if pedido.status == Pedido.Status.ATRIBUIDO:
            pedido.status = Pedido.Status.CONFERINDO
            pedido.conferencia_iniciada_em = timezone.now()
            pedido.save(update_fields=['status', 'conferencia_iniciada_em'])

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
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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

    if codigo != item.ean and codigo != item.sku:
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

    with transaction.atomic():
        VolumeItem.objects.create(volume=volume, pedido_item=item, qtd=qtd)
        item.qtd_separada = models.F('qtd_separada') + qtd
        item.save(update_fields=['qtd_separada'])
        item.refresh_from_db(fields=['qtd_separada'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='item_bipado',
            payload={
                'item_id': item.id, 'sku': item.sku, 'qtd': qtd,
                'qtd_separada_total': item.qtd_separada, 'volume_id': volume.id,
            },
        )

    return Response({
        'resultado': 'ok',
        'item_id': item.id,
        'qtd_separada': item.qtd_separada,
        'qtd_pedida': item.qtd_pedida,
        'volume_id': volume.id,
    })


# ---------------------------------------------------------------------------
# Remover lançamento de item dentro de um volume (corrige erro de bipagem)
# ---------------------------------------------------------------------------

@api_view(['DELETE'])
def remover_volume_item(request, pk, volume_id, volume_item_id):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(Pedido, pk=pk)
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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

def _enviar_volumes_ao_senior(pedido: Pedido) -> tuple[bool, str]:
    """Placeholder — o WS exato ainda não foi definido.

    Quando definido, esta função deve enviar a lista de volumes do pedido para
    o ERP Senior e retornar (sucesso, mensagem_de_erro).
    """
    logger.info(
        f"[Senior WS PLACEHOLDER] pedido {pedido.numero_externo} "
        f"com {pedido.volumes.count()} volume(s) — WS não configurado"
    )
    return True, ''


@api_view(['POST'])
def concluir(request, pk):
    err = _exige_conferente(request)
    if err:
        return err

    pedido = get_object_or_404(
        Pedido.objects.prefetch_related('itens', 'volumes'),
        pk=pk,
    )
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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
        pedido=pedido, usuario=request.user,
        acao='conferencia_concluida',
        payload={'volumes_count': pedido.volumes.count(), 'senior_ok': sucesso},
    )
    return Response({
        'ok': True,
        'status': pedido.status,
        'senior_ok': sucesso,
        'senior_erro': msg_erro,
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
    if pedido.conferente_id != request.user.id and request.user.perfil != 'admin':
        return Response({'erro': 'pedido não atribuído a você'}, status=http_status.HTTP_403_FORBIDDEN)

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
    return Response({
        'ok': True,
        'status': pedido.status,
        'motivo': motivo,
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
        .select_related('conferente', 'atribuido_por')
        .order_by('-nao_conforme_em')
    )
    motivos_label = dict(Pedido.MotivoNaoConforme.choices)
    return Response([
        {
            'id': p.id,
            'numero_externo': p.numero_externo,
            'cliente': p.cliente,
            'criado_em': p.criado_em,
            'nao_conforme_em': p.nao_conforme_em,
            'motivo': p.nao_conforme_motivo,
            'motivo_label': motivos_label.get(p.nao_conforme_motivo, p.nao_conforme_motivo),
            'detalhe': p.nao_conforme_detalhe,
            'conferente': p.conferente.username if p.conferente else None,
            'atribuido_por': p.atribuido_por.username if p.atribuido_por else None,
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

    pedido.status = Pedido.Status.CANCELADO
    pedido.save(update_fields=['status'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='nao_conforme_cancelado',
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

    pedido.status = Pedido.Status.PENDENTE
    pedido.selecionado_em = None
    pedido.selecionado_por = None
    pedido.atribuido_em = None
    pedido.atribuido_por = None
    pedido.conferente = None
    pedido.conferencia_iniciada_em = None
    pedido.nao_conforme_em = None
    pedido.nao_conforme_motivo = ''
    pedido.nao_conforme_detalhe = ''
    pedido.save(update_fields=[
        'status', 'selecionado_em', 'selecionado_por',
        'atribuido_em', 'atribuido_por', 'conferente', 'conferencia_iniciada_em',
        'nao_conforme_em', 'nao_conforme_motivo', 'nao_conforme_detalhe',
    ])
    PedidoLog.objects.create(
        pedido=pedido, usuario=request.user,
        acao='nao_conforme_retornado',
        payload={'motivo_anterior': motivo_anterior, 'detalhe_anterior': detalhe_anterior},
    )
    return Response({'ok': True, 'status': pedido.status})
