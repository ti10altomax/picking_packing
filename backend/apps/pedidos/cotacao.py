"""Nota "em cotação" de frete (2026-11-26, pedido do Pátio/Vendas).

A nota foi faturada com uma transportadora, mas ela ainda vai mudar (o frete está sendo
cotado). Enquanto o documento está marcado, a etiqueta de volume NÃO sai — nem a automática,
nem pelo botão — e as telas mostram "EM COTAÇÃO" no lugar do botão Etiqueta
(`apps.impressao.services.verificar_elegivel` → bloqueio `em_cotacao`).

Quem marca e tira: Sup. Vendas, Sup. Pátio e admin, em qualquer etapa antes do embarque
(Vendas, sequência do Pátio, Conferidos) — marcar cedo é o que impede o conferente de
imprimir ao concluir.

A cotação termina:
  - sozinha, quando a transportadora do documento fica diferente da que ele tinha na marcação
    (`Pedido.cotacao_codtra`): carta de correção feita pelo Separa, "Corrigir NF" que relê a
    nota, ou troca feita direto no Senior — esta última é vista pelo beat `verificar_cotacoes`
    (`verificar_no_senior`), porque os outros beats só preenchem transportadora vazia. A
    detecção é um `post_save` do Pedido (apps/pedidos/signals.py): vale para qualquer caminho
    que grave `codtra`;
  - pelo botão "Tirar de cotação" (a cotação acabou e ficou a mesma transportadora).

Toda mudança grava `PedidoLog` (`cotacao_marcada` / `cotacao_encerrada`).
"""
import logging

from django.utils import timezone

from .models import Pedido, PedidoLog

logger = logging.getLogger(__name__)

PERFIS = ('supervisor_vendas', 'supervisor_patio', 'admin')
# Depois de embarcado ou cancelado não há mais etiqueta a segurar.
STATUS_SEM_COTACAO = (Pedido.Status.CANCELADO, Pedido.Status.EMBARCADO)

MOTIVO_MANUAL = 'manual'
MOTIVO_TRANSPORTADORA = 'transportadora_alterada'

MENSAGEM_BLOQUEIO = ('nota em cotação de frete — a transportadora vai mudar; a etiqueta sai quando a '
                     'cotação terminar')


class ErroCotacao(Exception):
    pass


def marcar(pedido: Pedido, usuario) -> bool:
    """Põe o documento em cotação. False = já estava."""
    if pedido.status in STATUS_SEM_COTACAO:
        raise ErroCotacao(f'documento {pedido.get_status_display().lower()} não entra em cotação')
    if pedido.em_cotacao:
        return False
    pedido.em_cotacao = True
    pedido.cotacao_em = timezone.now()
    pedido.cotacao_por = usuario
    pedido.cotacao_codtra = pedido.codtra or ''
    pedido.save(update_fields=['em_cotacao', 'cotacao_em', 'cotacao_por', 'cotacao_codtra'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=usuario, acao='cotacao_marcada',
        payload={'codtra': pedido.codtra or '', 'transportadora': pedido.transportadora or '',
                 'status': pedido.status},
    )
    logger.info('cotação: %s entrou em cotação', pedido.numero_externo, extra={'pedido': pedido.id})
    return True


def encerrar(pedido: Pedido, usuario=None, motivo: str = MOTIVO_MANUAL) -> bool:
    """Tira o documento de cotação. False = não estava (ou outro processo já tirou).
    Não dispara etiqueta — quem chama decide (ver `liberar_etiqueta`)."""
    if not Pedido.objects.filter(pk=pedido.pk, em_cotacao=True).update(em_cotacao=False):
        pedido.em_cotacao = False
        return False
    codtra_antes = pedido.cotacao_codtra
    pedido.em_cotacao = False
    PedidoLog.objects.create(
        pedido=pedido, usuario=usuario, acao='cotacao_encerrada',
        payload={'motivo': motivo, 'codtra_na_marcacao': codtra_antes,
                 'codtra': pedido.codtra or '', 'transportadora': pedido.transportadora or ''},
    )
    logger.info('cotação: %s saiu de cotação (%s)', pedido.numero_externo, motivo, extra={'pedido': pedido.id})
    return True


def liberar_etiqueta(pedido: Pedido) -> None:
    """A etiqueta estava segura pela cotação: se a impressão automática está ligada e o documento
    é Conferido recente sem etiqueta, sai agora (mesma regra dos beats — nunca reimprime)."""
    from apps.impressao.services import disparar_se_pendente  # lazy: evita ciclo
    try:
        disparar_se_pendente(pedido)
    except Exception:
        logger.exception('cotação: falha ao disparar a etiqueta', extra={'pedido': pedido.id})


def verificar_no_senior() -> dict:
    """Beat: relê no Senior a transportadora das notas em cotação. Se mudou, alinha o Pedido — o
    `post_save` encerra a cotação — e libera a etiqueta. Pedido ainda sem nota fica como está."""
    from apps.carta_correcao.senior import situacao_nf  # lazy: evita ciclo

    em_cotacao = list(Pedido.objects.filter(em_cotacao=True).exclude(status__in=STATUS_SEM_COTACAO))
    encerradas = falhas = sem_nota = 0
    for pedido in em_cotacao:
        ident = pedido.identificacao_nf
        if ident is None:
            sem_nota += 1
            continue
        try:
            situacao = situacao_nf(*ident)
        except Exception:
            falhas += 1
            logger.exception('cotação: falha ao ler a nota no Senior', extra={'pedido': pedido.id})
            continue
        if not (situacao.get('disponivel') and situacao.get('encontrada')):
            falhas += 1
            continue
        codtra = str(situacao.get('codtra') or '').strip()
        if not codtra or codtra == (pedido.cotacao_codtra or ''):
            continue
        pedido.codtra = codtra
        pedido.transportadora = (situacao.get('nomtra') or f'Transportadora {codtra}')[:255]
        pedido.save(update_fields=['codtra', 'transportadora'])   # o post_save encerra a cotação
        if not pedido.em_cotacao:
            encerradas += 1
            liberar_etiqueta(pedido)
    # documento que embarcou ou foi cancelado ainda marcado: a cotação perdeu o sentido
    for pedido in Pedido.objects.filter(em_cotacao=True, status__in=STATUS_SEM_COTACAO):
        encerrar(pedido, motivo=f'documento {pedido.status}')
    return {'em_cotacao': len(em_cotacao), 'encerradas': encerradas, 'sem_nota': sem_nota, 'falhas': falhas}
