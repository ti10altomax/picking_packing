"""Beat da carta de correção (2026-11-19): relê a E140CCE das cartas do Separa que ainda não
têm desfecho e atualiza o status (autorizada / rejeitada / ainda não enviada).

Motivo: o `EmitirCartaCorrecao` devolveu 10011 ("verifique o log do SDE") para a NF 152139 em
18/11 à noite e a carta foi autorizada pela SEFAZ na manhã seguinte sem o Separa saber; a tela
dizia "erro ao transmitir" e a correção foi refeita, gerando uma carta duplicada (10021).
"""
import datetime as dt
import logging

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from apps.core.tarefas import registrar_execucao

logger = logging.getLogger(__name__)

JANELA_DIAS = 30


@shared_task
@registrar_execucao()
def verificar_cartas_pendentes():
    from .models import CartaCorrecao
    from .services import reconciliar_nf

    limite = timezone.now() - dt.timedelta(days=JANELA_DIAS)
    # "Transmitida" sem protocolo (2026-11-23) também: o Senior respondia "autorizado com
    # sucesso" sem a carta ter saído; só a E140CCE diz se foi autorizada.
    pendentes = (CartaCorrecao.objects
                 .filter(criado_em__gte=limite)
                 .filter(Q(status__in=[CartaCorrecao.Status.GRAVADA, CartaCorrecao.Status.AGUARDANDO_SDE,
                                       CartaCorrecao.Status.ERRO_TRANSMITIR])
                         | Q(status=CartaCorrecao.Status.TRANSMITIDA, protocolo__regex=r'^\s*$'))
                 .exclude(nf_numero='')
                 .select_related('pedido'))
    notas = {}
    for c in pendentes:
        notas.setdefault((c.nf_codfil, c.nf_codsnf, c.nf_numero), c.pedido)
    mudadas = 0
    falhas = 0
    for ident, pedido in notas.items():
        try:
            mudadas += len(reconciliar_nf(pedido, ident))
        except Exception:
            falhas += 1
            logger.exception('carta_correcao: falha ao verificar NF %s', ident[2], extra={'pedido': pedido.id})
    logger.info('carta_correcao: %d nota(s) verificada(s), %d carta(s) atualizada(s), %d falha(s)',
                len(notas), mudadas, falhas)
    return {'notas': len(notas), 'atualizadas': mudadas, 'falhas': falhas}
