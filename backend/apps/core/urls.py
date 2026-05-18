from django.urls import path
from . import views

urlpatterns = [
    path('users/separadores/', views.listar_separadores, name='listar_separadores'),
]
