from django.urls import path
from . import views

urlpatterns = [
    path('conferencia/pedidos/', views.listar_atribuidos, name='conferencia_listar_atribuidos'),
    path('conferencia/pedidos/<int:pk>/', views.detalhe, name='conferencia_detalhe'),
    path('conferencia/pedidos/<int:pk>/iniciar/', views.iniciar, name='conferencia_iniciar'),
    path('conferencia/pedidos/<int:pk>/volumes/', views.criar_volume, name='conferencia_criar_volume'),
    path('conferencia/pedidos/<int:pk>/volumes/<int:volume_id>/',
         views.remover_volume, name='conferencia_remover_volume'),
    path('conferencia/pedidos/<int:pk>/volumes/<int:volume_id>/itens/<int:volume_item_id>/',
         views.remover_volume_item, name='conferencia_remover_volume_item'),
    path('conferencia/pedidos/<int:pk>/bipar/', views.bipar, name='conferencia_bipar'),
    path('conferencia/pedidos/<int:pk>/concluir/', views.concluir, name='conferencia_concluir'),
    path('conferencia/pedidos/<int:pk>/nao_conforme/', views.marcar_nao_conforme, name='conferencia_nao_conforme'),

    # Lista de Não Conformes (supervisores)
    path('nao-conformes/', views.listar_nao_conformes, name='listar_nao_conformes'),
    path('nao-conformes/<int:pk>/cancelar/', views.cancelar_nao_conforme, name='cancelar_nao_conforme'),
    path('nao-conformes/<int:pk>/retornar/', views.retornar_nao_conforme, name='retornar_nao_conforme'),
]
