from django.urls import path
from . import views

urlpatterns = [
    path('users/conferentes/', views.listar_conferentes, name='listar_conferentes'),
    # Observabilidade (2026-10-08)
    path('health/', views.health, name='health'),                 # Docker healthcheck, sem auth
    path('saude/', views.saude_completa, name='saude_completa'),  # Admin → Saúde
    path('erros-cliente/', views.registrar_erro_cliente, name='registrar_erro_cliente'),  # POST, sem auth obrigatória
    path('erros-cliente/lista/', views.listar_erros_cliente, name='listar_erros_cliente'),
]
