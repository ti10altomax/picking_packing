from django.urls import path
from . import views

# /api/… (incluído em config/urls.py com prefixo 'api/')
urlpatterns = [
    path('app/versao/', views.versao_atual, name='app_versao'),          # público — o app compara
    path('app/versoes/', views.versoes, name='app_versoes'),             # admin — lista/publica
    path('app/versoes/<int:pk>/', views.apagar_versao, name='app_apagar_versao'),
]

# /apk/… (raiz, fora do /api/ — URL curta para digitar no coletor)
# /ajuda  — o "?" do app abre API_URL/ajuda; o backend redireciona para o web (SEPARA_WEB_URL)
urlpatterns_apk = [
    path('apk/', views.pagina_apk, name='apk_pagina'),
    path('apk/<str:nome>', views.baixar_apk, name='apk_baixar'),
    path('ajuda', views.ajuda_redirect, name='ajuda_redirect'),
    path('ajuda/', views.ajuda_redirect),
]
