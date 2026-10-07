from django.urls import path
from . import views

urlpatterns = [
    path('impressao/pedidos/<int:pk>/etiquetas/', views.etiquetas, name='impressao_etiquetas'),
    path('impressao/pedidos/<int:pk>/etiquetas/zpl/', views.etiquetas_zpl, name='impressao_etiquetas_zpl'),
    path('impressao/pedidos/<int:pk>/imprimir/', views.imprimir, name='impressao_imprimir'),
    path('impressao/pendentes/', views.pendentes, name='impressao_pendentes'),
    path('impressao/impressoras/', views.impressoras, name='impressao_impressoras'),
    path('impressao/config/', views.config, name='impressao_config'),
]
