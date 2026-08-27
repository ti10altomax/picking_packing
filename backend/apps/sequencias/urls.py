from django.urls import path
from . import views

urlpatterns = [
    path('sequencias/', views.listar_ou_criar, name='sequencias_listar_ou_criar'),
    path('sequencias/<int:pk>/', views.detalhe_ou_excluir, name='sequencias_detalhe_ou_excluir'),
    path('sequencias/<int:pk>/adicionar/', views.adicionar, name='sequencias_adicionar'),
    path('sequencias/<int:pk>/remover/', views.remover, name='sequencias_remover'),
    path('sequencias/<int:pk>/atribuir/', views.atribuir, name='sequencias_atribuir'),
]
