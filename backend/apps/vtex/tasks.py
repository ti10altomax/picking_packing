from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task
def resgatar_etiquetas_pendentes():
    """
    Polling periódico: para cada pedido Faturado sem etiqueta VTEX, tenta buscar.
    """
    from apps.pedidos.models import Pedido, EtiquetaVtex, PedidoLog
    from .client import buscar_etiqueta

    pedidos = Pedido.objects.filter(
        status=Pedido.Status.FATURADO,
        etiqueta_vtex_recebida_em__isnull=True,
        etiqueta_vtex_tentativas__lt=20,
    )

    for pedido in pedidos:
        try:
            resultado = buscar_etiqueta(pedido.numero_externo)
            if resultado is None:
                pedido.etiqueta_vtex_tentativas += 1
                pedido.save(update_fields=['etiqueta_vtex_tentativas'])
                continue

            EtiquetaVtex.objects.update_or_create(
                pedido=pedido,
                defaults={
                    'formato': resultado['formato'],
                    'conteudo': resultado['conteudo'],
                    'hash': resultado['hash'],
                }
            )
            pedido.etiqueta_vtex_recebida_em = timezone.now()
            pedido.status = Pedido.Status.AGUARDANDO_ETIQUETAR
            pedido.save()
            PedidoLog.objects.create(
                pedido=pedido, usuario=None,
                acao='etiqueta_vtex_recebida',
                payload={'formato': resultado['formato'], 'hash': resultado['hash']}
            )
            logger.info(f"Etiqueta VTEX recebida para pedido {pedido.numero_externo}")

        except Exception as exc:
            pedido.etiqueta_vtex_tentativas += 1
            pedido.etiqueta_vtex_ultimo_erro = str(exc)
            pedido.save(update_fields=['etiqueta_vtex_tentativas', 'etiqueta_vtex_ultimo_erro'])
            logger.error(f"Erro ao resgatar etiqueta VTEX pedido {pedido.numero_externo}: {exc}")
