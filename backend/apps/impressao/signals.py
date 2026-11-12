"""Ack do agente USB → registro da etiqueta (2026-11-11).

A view `ack_job` (apps/etiquetas/views.py, módulo congelado reaproveitado) só muda o
`PrintJob` para `retirado`/`erro`. Este signal escuta essa mudança e fecha o
`ImpressaoEtiqueta` `na_fila` correspondente (`services.confirmar_job`): assim a
etiqueta só conta como impressa quando o agente confirmou a saída, sem alterar o
módulo congelado. Vale também para quem muda o status do job no Django Admin.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.pedidos.models import PrintJob


@receiver(post_save, sender=PrintJob, dispatch_uid='impressao_confirmar_job')
def _print_job_salvo(sender, instance: PrintJob, created: bool, **kwargs):
    if created or instance.status == PrintJob.Status.PENDENTE:
        return
    from .services import confirmar_job  # lazy: services importa models deste app
    confirmar_job(instance)
