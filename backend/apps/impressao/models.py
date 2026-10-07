from django.conf import settings
from django.db import models

from apps.pedidos.models import Impressora, Pedido, PrintJob


class ImpressaoEtiqueta(models.Model):
    """Histórico de impressão das etiquetas de volume de um pedido (2026-10-07, ponto 7).

    Uma linha por disparo (automático ao virar Conferido, manual pelo botão
    "Imprimir/Reimprimir"). O canal diz por onde saiu: Zebra de rede (TCP 9100),
    agente USB (fila `PrintJob`) ou navegador (página HTML 10x15 impressa pelo
    próprio usuário). Pedido sem nenhuma linha `ok` aparece em "Etiquetas pendentes".
    """

    class Canal(models.TextChoices):
        REDE = 'rede', 'Zebra de rede'
        AGENTE = 'agente', 'Agente USB'
        NAVEGADOR = 'navegador', 'Navegador'

    class Status(models.TextChoices):
        OK = 'ok', 'Impressa'
        ERRO = 'erro', 'Erro'

    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='impressoes_etiqueta')
    impressora = models.ForeignKey(
        Impressora, null=True, blank=True, on_delete=models.SET_NULL, related_name='impressoes_etiqueta',
    )
    canal = models.CharField(max_length=20, choices=Canal.choices)
    status = models.CharField(max_length=10, choices=Status.choices)
    qtd_etiquetas = models.IntegerField(default=0)
    automatica = models.BooleanField(default=False)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='impressoes_etiqueta',
    )
    print_job = models.ForeignKey(PrintJob, null=True, blank=True, on_delete=models.SET_NULL)
    erro = models.TextField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Impressão de etiqueta'
        verbose_name_plural = 'Impressões de etiqueta'
        indexes = [models.Index(fields=['pedido', 'status'])]

    def __str__(self):
        return f'{self.pedido} · {self.get_canal_display()} · {self.get_status_display()}'
