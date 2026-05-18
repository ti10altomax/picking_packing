from django.urls import path
from . import views

urlpatterns = [
    path('separacao/pedidos/', views.listar_atribuidos, name='separacao_listar_atribuidos'),
    path('separacao/pedidos/<int:pk>/', views.detalhe, name='separacao_detalhe'),
    path('separacao/pedidos/<int:pk>/iniciar/', views.iniciar, name='separacao_iniciar'),
    path('separacao/pedidos/<int:pk>/volumes/', views.criar_volume, name='separacao_criar_volume'),
    path('separacao/pedidos/<int:pk>/volumes/<int:volume_id>/',
         views.remover_volume, name='separacao_remover_volume'),
    path('separacao/pedidos/<int:pk>/volumes/<int:volume_id>/itens/<int:volume_item_id>/',
         views.remover_volume_item, name='separacao_remover_volume_item'),
    path('separacao/pedidos/<int:pk>/bipar/', views.bipar, name='separacao_bipar'),
    path('separacao/pedidos/<int:pk>/concluir/', views.concluir, name='separacao_concluir'),
    path('separacao/pedidos/<int:pk>/nao_conforme/', views.marcar_nao_conforme, name='separacao_nao_conforme'),

    # Lista de Não Conformes (supervisores)
    path('nao-conformes/', views.listar_nao_conformes, name='listar_nao_conformes'),
    path('nao-conformes/<int:pk>/cancelar/', views.cancelar_nao_conforme, name='cancelar_nao_conforme'),
    path('nao-conformes/<int:pk>/retornar/', views.retornar_nao_conforme, name='retornar_nao_conforme'),
]
