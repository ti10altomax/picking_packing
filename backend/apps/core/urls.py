from django.urls import path
from . import views

urlpatterns = [
    path('users/conferentes/', views.listar_conferentes, name='listar_conferentes'),
]
