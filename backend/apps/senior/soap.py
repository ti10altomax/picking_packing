"""
Senior G5 SOAP — embalagempfa
  Service : g5-senior-services
  Port    : sapiens_Synccom_senior_g5_co_mcm_ven_embalagempfaPort
  Operation: Gerar
  Input   : user, password, encryption(int), parameters(embalagempfaGerarIn)
              embalagempfaGerarIn.codEmp = 8
              embalagempfaGerarIn.codFil = 1
              embalagempfaGerarIn.numPfa = <pré-fatura ativa no Oracle>
"""
from zeep import Client
from zeep.transports import Transport
from requests import Session
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        session = Session()
        transport = Transport(session=session, timeout=30, operation_timeout=30)
        _client = Client(wsdl=settings.SENIOR_WSDL_EMBALAGEM, transport=transport)
    return _client


def _buscar_num_pfa(numero_pedido: str) -> int:
    """
    Retorna o numPfa ativo para o NUMPED informado.
    Busca na tabela de pré-faturas do Senior a última pré-fatura não cancelada.

    Se nenhuma for encontrada, levanta ValueError.
    """
    from .oracle import fetch

    # Ajustar TABLE_NAME se necessário após inspecionar_wsdl.py revelar o nome real.
    # Filtro SITPFA != 'C' exclui pré-faturas canceladas.
    rows = fetch("""
        SELECT NUMPFA
        FROM E140PFA
        WHERE CODEMP = 8
          AND NUMPED = :1
          AND (SITPFA IS NULL OR SITPFA != 'C')
        ORDER BY NUMPFA DESC
    """, [numero_pedido])

    if not rows:
        raise ValueError(
            f"Nenhuma pré-fatura ativa encontrada para o pedido {numero_pedido} "
            f"(tabela E140PFA, CODEMP=8). Verifique se a tabela é E140PFA ou outra."
        )

    return int(rows[0]['numpfa'])


def notificar_embalagem(numero_pedido: str) -> dict:
    """
    Chama o WS embalagempfa do Senior G5 sinalizando que o pedido foi separado/embalado.

    Fluxo:
      1. Busca numPfa ativo no Oracle para o NUMPED
      2. Chama service.Gerar(user, password, encryption=0, parameters=embalagempfaGerarIn)

    Levanta ValueError se não encontrar pré-fatura; levanta zeep.exceptions.Fault em erro SOAP.
    """
    client = _get_client()

    num_pfa = _buscar_num_pfa(numero_pedido)
    logger.info(f"Chamando embalagempfa — pedido={numero_pedido} numPfa={num_pfa}")

    parameters = {
        'codEmp': 8,
        'codFil': 1,
        'numPfa': num_pfa,
    }

    result = client.service.Gerar(
        user=settings.SENIOR_WS_USER,
        password=settings.SENIOR_WS_PASSWORD,
        encryption=0,
        parameters=parameters,
    )

    logger.info(f"embalagempfa retornou — pedido={numero_pedido}: {result}")
    return result
