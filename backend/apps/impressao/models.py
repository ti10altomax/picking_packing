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
        # Agente USB (2026-11-11): o job foi enfileirado e o agente ainda não confirmou a
        # saída. Vira `ok` ou `erro` pelo ack do agente (`signals.py`). Só `ok` conta como
        # impressa para pendentes/listas.
        NA_FILA = 'na_fila', 'Na fila do agente'

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


def _caminho_agente(instancia, nome):
    return f'agente/SeparaAgente-{instancia.versao}.exe'


class VersaoAgente(models.Model):
    """Executável do agente de impressão USB publicado pelo admin (2026-11-12) — mesmo
    desenho do `VersaoApp` do APK. Servido em `/agente/` (ver `distribuicao.py`); a
    "atual" é a última publicada (a publicação exige versão crescente)."""
    versao = models.CharField('versão', max_length=20, unique=True)   # VERSAO do separa_agente.py
    arquivo = models.FileField(upload_to=_caminho_agente)
    tamanho_bytes = models.BigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    notas = models.TextField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    criado_por = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name = 'Versão do agente de impressão'
        verbose_name_plural = 'Versões do agente de impressão'
        ordering = ['-criado_em']

    def __str__(self):
        return f'SeparaAgente {self.versao}'

    @property
    def nome_arquivo(self) -> str:
        return f'SeparaAgente-{self.versao}.exe'

    @classmethod
    def atual(cls):
        return cls.objects.order_by('-criado_em').first()
