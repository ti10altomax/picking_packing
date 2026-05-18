import socket
import logging

logger = logging.getLogger(__name__)


def enviar_para_rede(ip: str, porta: int, conteudo: bytes) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(10)
        s.connect((ip, porta))
        s.sendall(conteudo)
    logger.info(f"Job enviado para {ip}:{porta} ({len(conteudo)} bytes)")


def ping_impressora_rede(ip: str, porta: int, timeout: int = 3) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((ip, porta))
        return True
    except OSError:
        return False


def enviar_para_agent(impressora, conteudo: bytes) -> None:
    from apps.pedidos.models import PrintJob  # evita import circular
    job = PrintJob.objects.create(impressora=impressora, conteudo=conteudo)
    logger.info(f"Job {job.id} enfileirado para impressora {impressora.id} (agent_id={impressora.agent_id})")
