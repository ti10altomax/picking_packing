from django.urls import path
from . import distribuicao, views

urlpatterns = [
    # Distribuição do agente USB (SeparaAgente.exe) — ver distribuicao.py
    path('impressao/agente/versao/', distribuicao.versao_atual, name='agente_versao'),        # público
    path('impressao/agente/versoes/', distribuicao.versoes, name='agente_versoes'),           # admin
    path('impressao/agente/versoes/<int:pk>/', distribuicao.apagar_versao, name='agente_apagar_versao'),
    path('impressao/pedidos/<int:pk>/etiquetas/', views.etiquetas, name='impressao_etiquetas'),
    path('impressao/pedidos/<int:pk>/etiquetas/zpl/', views.etiquetas_zpl, name='impressao_etiquetas_zpl'),
    path('impressao/pedidos/<int:pk>/imprimir/', views.imprimir, name='impressao_imprimir'),
    path('impressao/pendentes/', views.pendentes, name='impressao_pendentes'),
    path('impressao/impressoras/', views.impressoras, name='impressao_impressoras'),
    path('impressao/config/', views.config, name='impressao_config'),
]

# /agente/… (raiz, fora do /api/ — URL curta para digitar no navegador do PC da impressora)
urlpatterns_agente = [
    path('agente/', distribuicao.pagina_agente, name='agente_pagina'),
    path('agente/agente.ini', distribuicao.baixar_ini, name='agente_ini'),
    path('agente/<str:nome>', distribuicao.baixar_exe, name='agente_baixar'),
]
