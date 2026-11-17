"""Código de barras alternativo (2026-11-17) — ver `CodigoBarrasAlias`.

Um só lugar decide se um código bipado "bate" com um item: EAN e SKU exatos primeiro,
alias cadastrado depois. Quem usa: `conferencia.views.bipar` (trava), o detalhe do
documento (manda a lista de códigos aceitos para web e coletor casarem localmente) e
`liberar_divergencia` (não deixa liberar à mão o que já tem alias).
"""
from __future__ import annotations

from .models import CodigoBarrasAlias, PedidoItem


def alias_para(codigo: str, item: PedidoItem) -> CodigoBarrasAlias | None:
    """O alias ativo que faz `codigo` valer pelo EAN de `item`, ou None.

    Nunca se aplica quando o código já é o EAN ou o SKU do item (não há o que
    substituir) nem quando o item não tem EAN.
    """
    if not codigo or not item.ean or codigo in (item.ean, item.sku):
        return None
    return CodigoBarrasAlias.objects.filter(
        codigo_lido=codigo, codigo_certo=item.ean, ativo=True,
    ).first()


def codigo_bate(codigo: str, item: PedidoItem) -> bool:
    return codigo in (item.ean, item.sku) or alias_para(codigo, item) is not None


def alternativos_por_ean(eans) -> dict[str, list[str]]:
    """{ean certo: [códigos lidos aceitos]} dos aliases ativos, para um conjunto de EANs."""
    eans = {e for e in eans if e}
    if not eans:
        return {}
    resultado: dict[str, list[str]] = {}
    for lido, certo in (
        CodigoBarrasAlias.objects.filter(codigo_certo__in=eans, ativo=True)
        .order_by('codigo_lido').values_list('codigo_lido', 'codigo_certo')
    ):
        resultado.setdefault(certo, []).append(lido)
    return resultado
