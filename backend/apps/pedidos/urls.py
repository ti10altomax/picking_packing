from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PedidoViewSet
from . import views_obs

router = DefaultRouter()
router.register('pedidos', PedidoViewSet, basename='pedido')

urlpatterns = [
    # Observabilidade (2026-10-08) — antes do router; não colidem com pedidos/<pk>/
    path('pedidos/<int:pk>/historico/', views_obs.historico_pedido, name='historico_pedido'),
    path('agora/', views_obs.agora, name='agora'),
    path('', include(router.urls)),
]
