"""Views de observabilidade dos pedidos (2026-10-08): histórico e painel "agora".

Ficam fora do PedidoViewSet para não misturar com as ações de fluxo; as rotas
entram em pedidos/urls.py antes do router (não colidem com `pedidos/<pk>/`).
"""
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from . import agora as painel_agora
from .historico import linha_do_tempo
from .models import Pedido

PERFIS_GESTAO = ('supervisor_patio', 'supervisor_vendas', 'admin')


@api_view(['GET'])
def historico_pedido(request, pk):
    """Linha do tempo do documento (PedidoLog com rótulos). Supervisores, admin
    e o próprio conferente do pedido."""
    pedido = get_object_or_404(Pedido.objects.select_related('conferente', 'sequencia'), pk=pk)
    if request.user.perfil not in PERFIS_GESTAO and pedido.conferente_id != request.user.id:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return Response({
        'pedido': {
            'id': pedido.id, 'tipo': pedido.tipo, 'numero_externo': pedido.numero_externo,
            'cliente': pedido.cliente, 'status': pedido.status, 'status_label': pedido.get_status_display(),
            'conferente': pedido.conferente.username if pedido.conferente else None,
            'sequencia': pedido.sequencia.numero if pedido.sequencia else None,
            'transportadora': pedido.transportadora,
        },
        'eventos': linha_do_tempo(pedido),
    })


@api_view(['GET'])
def agora(request):
    """Painel "agora no galpão" (supervisores e admin)."""
    if request.user.perfil not in PERFIS_GESTAO:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return Response(painel_agora.painel())
