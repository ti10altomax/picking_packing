import hashlib
import requests
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

VTEX_BASE_URL = "https://{account}.vtexcommercestable.com.br/api"


def _headers():
    return {
        'X-VTEX-API-AppKey': settings.VTEX_APP_KEY,
        'X-VTEX-API-AppToken': settings.VTEX_APP_TOKEN,
        'Accept': 'application/json',
    }


def buscar_etiqueta(numero_pedido: str) -> dict | None:
    """
    Busca a etiqueta de envio na VTEX API para o pedido.
    Retorna {'formato': ..., 'conteudo': bytes, 'hash': ...} ou None se ainda não disponível.

    TODO: confirmar endpoint correto com a VTEX/Altomax.
    Endpoint estimado: GET /logistics/pvt/shipping-label/{orderId}
    """
    if not settings.VTEX_APP_KEY:
        logger.warning("VTEX não configurada — VTEX_APP_KEY ausente")
        return None

    url = f"{VTEX_BASE_URL.format(account=settings.VTEX_ACCOUNT_NAME)}/logistics/pvt/shipping-label/{numero_pedido}"
    response = requests.get(url, headers=_headers(), timeout=15)

    if response.status_code == 404:
        return None
    if response.status_code == 200:
        conteudo = response.content
        return {
            'formato': 'pdf' if response.headers.get('Content-Type', '').startswith('application/pdf') else 'zpl',
            'conteudo': conteudo,
            'hash': hashlib.sha256(conteudo).hexdigest(),
        }
    response.raise_for_status()
