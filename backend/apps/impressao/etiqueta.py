"""Conteúdo da etiqueta de volume (10x15 cm) — independente do destino.

Monta a estrutura que o gerador ZPL (`zpl.py`) e a página HTML do frontend
renderizam. Uma etiqueta por volume com itens; volume com mais itens do que
cabe gera páginas de continuação (mesmo "Volume N de M", "cont. 2/3").

Substitui o que hoje é escrito a pincel na caixa (volumes + itens +
transportadora + dados do pedido) e absorve a *carta de transporte* (folha A4
que ia junto com a mercadoria) como rodapé em fonte pequena.
"""
from collections import defaultdict

from django.utils import timezone

from apps.pedidos.models import Pedido, PedidoItem, Volume, VolumeItem

# Quantos itens cabem numa etiqueta — igual no ZPL (2 linhas de 43 dots por item) e no HTML
ITENS_POR_PAGINA = 8

# Texto fixo da antiga "carta de transporte" (docx da expedição, 2026-10-07)
RODAPE_TITULO = 'TRANSPORTE E CONFERÊNCIA DE MERCADORIA'
RODAPE_RESPONSABILIDADES = [
    'Conferir eventuais avarias na mercadoria e nas caixas no ato do recebimento.',
    'Conferir se os produtos recebidos estão de acordo com o pedido.',
    'Não receber caso a embalagem esteja violada.',
    'Devolução de produtos: devolucao@altomax.com.br',
    'Qualquer desacordo: (45) 3574-5322 em até 7 dias úteis.',
]
RODAPE_EMPRESA = [
    'Altomax / Hoahi · Av. Perimetral Leste, 8119 · Foz do Iguaçu/PR · CEP 85.859-326',
    '(45) 3574-5322 · atendimento@altomax.com.br · altomax.com.br · hoahi.com.br',
]


def _itens_do_volume(volume: Volume) -> list[dict]:
    """Agrega os lançamentos do volume por item do pedido (vários bips do mesmo SKU somam)."""
    por_item: dict[int, dict] = {}
    qtds: dict[int, int] = defaultdict(int)
    for vi in volume.itens.all():
        item: PedidoItem = vi.pedido_item
        qtds[item.id] += vi.qtd
        por_item.setdefault(item.id, {'sku': item.sku, 'descricao': item.descricao, 'ean': item.ean})
    linhas = [{**por_item[i], 'qtd': q} for i, q in qtds.items()]
    linhas.sort(key=lambda l: (l['sku'] or '', l['descricao'] or ''))
    return linhas


def _paginar(itens: list[dict], tamanho: int = ITENS_POR_PAGINA) -> list[list[dict]]:
    if not itens:
        return [[]]
    return [itens[i:i + tamanho] for i in range(0, len(itens), tamanho)]


def dados_etiquetas(pedido: Pedido) -> dict:
    """Tudo que vai impresso, em estrutura neutra (JSON-serializável)."""
    volumes = list(
        pedido.volumes.order_by('criado_em', 'id').prefetch_related('itens__pedido_item')
    )
    # Só volumes com mercadoria viram caixa física — volume aberto e vazio não imprime
    com_itens = [v for v in volumes if v.itens.exists()]
    total = len(com_itens)

    etiquetas = []
    for numero, volume in enumerate(com_itens, start=1):
        itens = _itens_do_volume(volume)
        paginas = _paginar(itens)
        for pagina, bloco in enumerate(paginas, start=1):
            etiquetas.append({
                'volume': {
                    'id': volume.id,
                    'numero': numero,
                    'tipo': volume.tipo,
                    'tipo_label': volume.get_tipo_display(),
                    'identificador': volume.identificador,
                },
                'pagina': pagina,
                'total_paginas': len(paginas),
                'itens': bloco,
                'qtd_unidades': sum(i['qtd'] for i in itens),
                'qtd_itens': len(itens),
            })

    conferido_em = pedido.conferido_em
    return {
        'pedido': {
            'id': pedido.id,
            'tipo': pedido.tipo,
            'tipo_label': 'NF' if pedido.tipo == Pedido.Tipo.NOTA_FISCAL else 'Pedido',
            'numero_externo': pedido.numero_externo,
            'codfil': pedido.codfil,
            'codsnf': pedido.codsnf,
            'cliente': pedido.cliente,
            'transportadora': pedido.transportadora,
            'codtra': pedido.codtra,
            'frete': pedido.frete,
            'frete_label': pedido.frete_label,
            'conferido_em': conferido_em,
            'conferente': pedido.conferente.username if pedido.conferente else None,
            'sequencia_numero': pedido.sequencia.numero if pedido.sequencia else None,
        },
        'total_volumes': total,
        'etiquetas': etiquetas,
        'rodape': {
            'titulo': RODAPE_TITULO,
            'responsabilidades': RODAPE_RESPONSABILIDADES,
            'empresa': RODAPE_EMPRESA,
        },
        'gerado_em': timezone.now(),
    }
