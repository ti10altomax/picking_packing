from django.contrib.auth.models import AbstractUser
from django.db import models


class Configuracao(models.Model):
    """Configurações operacionais do sistema (DESIGN.md — "Configurações do sistema").

    Editável pelo admin no Django admin. `obter()` devolve o default quando a
    chave ainda não foi cadastrada.
    """

    class Chave(models.TextChoices):
        LIBERACAO_PROXIMA_SEQUENCIA = 'liberacao_proxima_sequencia', 'Liberação da próxima sequência'
        FECHAMENTO_SOBRA = 'fechamento_sobra', 'Fechamento de pedido com sobra'

    # valores válidos por chave (documentação viva; o admin não valida à força)
    DEFAULTS = {
        'liberacao_proxima_sequencia': 'ao_terminar_meus_pedidos',  # | ao_concluir_sequencia_inteira
        'fechamento_sobra': 'supervisor_patio',                     # | conferente
    }

    chave = models.CharField(max_length=50, choices=Chave.choices, unique=True)
    valor = models.CharField(max_length=50)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuração'
        verbose_name_plural = 'Configurações'

    def __str__(self):
        return f'{self.get_chave_display()}: {self.valor}'

    @classmethod
    def obter(cls, chave: str) -> str:
        try:
            return cls.objects.get(chave=chave).valor
        except cls.DoesNotExist:
            return cls.DEFAULTS.get(chave, '')


class User(AbstractUser):
    class Perfil(models.TextChoices):
        CONFERENTE = 'conferente', 'Conferente'
        SUPERVISOR_VENDAS = 'supervisor_vendas', 'Supervisor de Vendas'
        SUPERVISOR_PATIO = 'supervisor_patio', 'Supervisor de Pátio'
        ADMIN = 'admin', 'Admin'
        ETIQUETADOR = 'etiquetador', 'Etiquetador'  # CONGELADO — escopo antigo

    perfil = models.CharField(max_length=20, choices=Perfil.choices, default=Perfil.CONFERENTE)

    def __str__(self):
        return f'{self.username} ({self.get_perfil_display()})'
