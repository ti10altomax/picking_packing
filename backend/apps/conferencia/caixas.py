"""Estimativa de caixas do documento (2026-11-23).

    soma(qtd do item × COMDER × LARDER × ALTDER) / 102396

Passou de 1 → o documento não cabe numa caixa só e a tela de conferência avisa o conferente.
As medidas vêm da derivação no Senior (E075DER, `PedidoItem.comprimento/largura/altura`);
item sem medida fica de fora da soma e é contado à parte, para a tela dizer que a estimativa
está incompleta.
"""
import logging
from decimal import Decimal, InvalidOperation

from apps.core.models import Configuracao
from apps.pedidos.models import PedidoItem

logger = logging.getLogger(__name__)

# Default da chave `volume_caixa` (fórmula do usuário); o valor vigente vem da Configuracao.
VOLUME_CAIXA_PADRAO = Decimal('102396')


def volume_caixa() -> Decimal:
    """Volume interno da caixa padrão (Configuracao `volume_caixa`, cm³)."""
    bruto = Configuracao.obter(Configuracao.Chave.VOLUME_CAIXA)
    try:
        v = Decimal(str(bruto).replace(',', '.'))
    except (InvalidOperation, TypeError, ValueError):
        v = Decimal(0)
    if v <= 0:
        logger.warning('volume_caixa inválido (%r); usando %s', bruto, VOLUME_CAIXA_PADRAO)
        return VOLUME_CAIXA_PADRAO
    return v


def volume_unitario(item) -> float | None:
    """cm³ de uma unidade do item, ou None sem medida."""
    if item.comprimento and item.largura and item.altura:
        return float(item.comprimento * item.largura * item.altura)
    return None


def estimar(itens, divisor: Decimal | None = None) -> dict | None:
    """{'caixas': float, 'itens_sem_medida': int} ou None quando nenhum item tem medida."""
    volume = Decimal(0)
    com_medida = sem_medida = 0
    for i in itens:
        if i.status != PedidoItem.Status.OK:
            continue
        if i.comprimento and i.largura and i.altura:
            volume += i.qtd_pedida * i.comprimento * i.largura * i.altura
            com_medida += 1
        else:
            sem_medida += 1
    if not com_medida:
        return None
    return {
        'caixas': round(float(volume / (divisor or volume_caixa())), 2),
        'itens_sem_medida': sem_medida,
    }


def ocupacao_volume(volume, divisor: Decimal | None = None) -> float:
    """Fração da caixa padrão ocupada pelos lançamentos do volume (itens sem medida contam 0)."""
    total = Decimal(0)
    for vi in volume.itens.select_related('pedido_item'):
        i = vi.pedido_item
        if i.comprimento and i.largura and i.altura:
            total += vi.qtd * i.comprimento * i.largura * i.altura
    return float(total / (divisor or volume_caixa()))


def avaliar_caixa_cheia(volume, antes: float, depois: float) -> dict | None:
    """Caixa cheia (2026-11-23): a leitura que faz a CAIXA passar de 1 (da caixa padrão)
    devolve o aviso; as seguintes no mesmo volume não repetem. Fardo/outro não entram —
    o divisor é a caixa."""
    from apps.pedidos.models import Volume
    if volume.tipo != Volume.Tipo.CAIXA or not (antes <= 1 < depois):
        return None
    return {'ocupacao': round(depois, 2)}
