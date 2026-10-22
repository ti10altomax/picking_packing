from django.urls import path
from . import views

urlpatterns = [
    path('carta-correcao/pedidos/<int:pk>/preparar/', views.preparar, name='cce_preparar'),
    path('carta-correcao/pedidos/<int:pk>/previa/', views.previa, name='cce_previa'),
    path('carta-correcao/pedidos/<int:pk>/', views.executar, name='cce_executar'),
    path('carta-correcao/transportadoras/', views.transportadoras, name='cce_transportadoras'),
    path('carta-correcao/config/', views.config, name='cce_config'),
    path('carta-correcao/', views.listar, name='cce_listar'),
]
