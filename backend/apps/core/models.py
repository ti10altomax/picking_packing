from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Perfil(models.TextChoices):
        SEPARADOR = 'separador', 'Separador'
        SUPERVISOR_VENDAS = 'supervisor_vendas', 'Supervisor de Vendas'
        SUPERVISOR_PATIO = 'supervisor_patio', 'Supervisor de Pátio'
        ADMIN = 'admin', 'Admin'
        ETIQUETADOR = 'etiquetador', 'Etiquetador'  # CONGELADO — escopo antigo

    perfil = models.CharField(max_length=20, choices=Perfil.choices, default=Perfil.SEPARADOR)

    def __str__(self):
        return f'{self.username} ({self.get_perfil_display()})'
