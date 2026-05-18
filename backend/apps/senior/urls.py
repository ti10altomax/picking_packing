from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from .tasks import sincronizar_pedidos_oracle

@api_view(['POST'])
@permission_classes([IsAdminUser])
def sync_oracle(request):
    sincronizar_pedidos_oracle.delay()
    return Response({'status': 'enfileirado'})

urlpatterns = [
    path('senior/sync/', sync_oracle, name='senior_sync'),
]
