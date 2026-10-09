import logging

from celery import shared_task

from apps.core.tarefas import registrar_execucao

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
@registrar_execucao(erro_se=lambda r: isinstance(r, dict) and r.get('erro'))
def imprimir_etiquetas(self, pedido_id: int, impressora_id: int):
    """Impressão automática das etiquetas de volume (fila Celery, fora do request)."""
    from apps.pedidos.models import Impressora, Pedido
    from .services import ErroImpressao, imprimir

    pedido = Pedido.objects.select_related('conferente', 'sequencia').filter(pk=pedido_id).first()
    impressora = Impressora.objects.filter(pk=impressora_id).first()
    if not pedido or not impressora:
        logger.warning(f'imprimir_etiquetas: pedido {pedido_id} / impressora {impressora_id} não encontrados')
        return {'ok': False, 'motivo': 'nao_encontrado'}
    try:
        reg = imprimir(pedido, impressora=impressora, automatica=True)
    except ErroImpressao as e:
        logger.info(f'imprimir_etiquetas: {pedido} não elegível — {e.codigo}')
        return {'ok': False, 'motivo': e.codigo}
    return {'ok': reg.status == 'ok', 'impressao_id': reg.id, 'erro': reg.erro}
