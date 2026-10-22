from django.conf import settings
from django.db import models

from apps.pedidos.models import Pedido


class CartaCorrecao(models.Model):
    """Carta de correção eletrônica (CC-e) feita pelo Separa — ponto 6 da diretoria (2026-10-22).

    Uma linha por tentativa de trocar a transportadora (e/ou o frete) de uma NF
    autorizada. Guarda o payload enviado e a resposta de cada WS do Senior, para
    auditoria e para explicar ao fiscal o que foi gravado. O ciclo é:

      simulada          dry-run (SENIOR_WS_DRY_RUN): montou tudo, não chamou o Senior
      gravada           cartadecorrecao.Gravar ok (carta "Não enviada" + NF atualizada)
      transmitida       documentofiscal.EmitirCartaCorrecao ok (modo gravar_e_transmitir)
      erro_gravar       Gravar recusou (tipoRetorno -1) ou falhou (rede/SOAP)
      erro_transmitir   gravou, mas a transmissão falhou — o faturamento envia no Senior
    """

    class Modo(models.TextChoices):
        DRY_RUN = 'dry_run', 'Simulação (dry-run)'
        GRAVAR = 'gravar', 'Só gravar'
        GRAVAR_E_TRANSMITIR = 'gravar_e_transmitir', 'Gravar e transmitir'

    class Status(models.TextChoices):
        SIMULADA = 'simulada', 'Simulada'
        GRAVADA = 'gravada', 'Gravada (não enviada)'
        TRANSMITIDA = 'transmitida', 'Transmitida'
        ERRO_GRAVAR = 'erro_gravar', 'Erro ao gravar'
        ERRO_TRANSMITIR = 'erro_transmitir', 'Gravada, erro ao transmitir'

    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='cartas_correcao')
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='cartas_correcao',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    modo = models.CharField(max_length=30, choices=Modo.choices)
    status = models.CharField(max_length=20, choices=Status.choices)

    # o que mudou
    codtra_anterior = models.CharField(max_length=20, blank=True)
    transportadora_anterior = models.CharField(max_length=255, blank=True)
    codtra_novo = models.CharField(max_length=20, blank=True)
    transportadora_nova = models.CharField(max_length=255, blank=True)
    frete_anterior = models.CharField(max_length=1, blank=True)
    frete_novo = models.CharField(max_length=1, blank=True)

    # texto da carta: o que foi enviado em desCor (com as cartas anteriores) e o complemento livre
    texto = models.TextField()
    complemento = models.TextField(blank=True)
    cartas_anteriores = models.JSONField(default=list, blank=True)   # lidas do Oracle antes de gravar

    # rastro dos dois WS
    payload_gravar = models.JSONField(default=dict, blank=True)
    retorno_gravar = models.JSONField(default=dict, blank=True)
    payload_transmitir = models.JSONField(default=dict, blank=True)
    retorno_transmitir = models.JSONField(default=dict, blank=True)
    erro = models.TextField(blank=True)

    # retorno da SEFAZ via EmitirCartaCorrecao (quando transmitida)
    sitdoe = models.IntegerField(null=True, blank=True)
    protocolo = models.CharField(max_length=30, blank=True)
    autorizada_em = models.CharField(max_length=20, blank=True)   # "DD/MM/AAAA hh:mm" como o Senior devolve

    class Meta:
        verbose_name = 'Carta de correção'
        verbose_name_plural = 'Cartas de correção'
        ordering = ['-criado_em']

    def __str__(self):
        return f'CC-e {self.pedido.numero_externo} · {self.get_status_display()} · {self.criado_em:%d/%m %H:%M}'

    @property
    def efetiva(self) -> bool:
        """Chegou a gravar no Senior (com ou sem transmissão)."""
        return self.status in (self.Status.GRAVADA, self.Status.TRANSMITIDA, self.Status.ERRO_TRANSMITIR)
