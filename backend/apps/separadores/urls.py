from django.urls import path
from . import views

urlpatterns = [
    path('separadores/', views.listar_ou_criar, name='separadores_listar_ou_criar'),
    path('separadores/liberar/', views.liberar, name='separadores_liberar'),
    path('separadores/desliberar/', views.desliberar, name='separadores_desliberar'),
    path('separadores/liberados/', views.listar_liberados, name='separadores_liberados'),
    path('separadores/<int:pk>/', views.atualizar, name='separadores_atualizar'),
]
