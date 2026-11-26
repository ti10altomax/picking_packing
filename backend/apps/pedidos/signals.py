"""Signals do app pedidos.

Cotação de frete (2026-11-26): qualquer caminho que grave uma transportadora diferente da que o
documento tinha quando entrou em cotação encerra a cotação — carta de correção, "Corrigir NF"
(que relê a nota), beats do Senior. Ver apps/pedidos/cotacao.py.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Pedido


@receiver(post_save, sender=Pedido, dispatch_uid='pedidos_cotacao_transportadora')
def encerrar_cotacao_se_transportadora_mudou(sender, instance, created=False, update_fields=None, **kwargs):
    if created or not instance.em_cotacao:
        return
    if update_fields is not None and 'codtra' not in update_fields:
        return
    if (instance.codtra or '') == (instance.cotacao_codtra or ''):
        return
    from . import cotacao  # lazy: cotacao importa os models
    cotacao.encerrar(instance, motivo=cotacao.MOTIVO_TRANSPORTADORA)
