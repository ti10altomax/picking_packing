"""Conteúdo da etiqueta de volume (10x15 cm) — independente do destino.

Monta a estrutura que o gerador ZPL (`zpl.py`) e a página HTML do frontend
renderizam. Uma etiqueta por volume com itens; volume com mais itens do que
cabe gera páginas de continuação (mesmo "Volume N de M", "cont. 2/3").

Dois modelos (2026-10-23, `Configuracao.etiqueta_modelo`), mesmos dados:
  - `padrao`   — descrição + SKU por item, 8 itens por etiqueta (o desenho original);
  - `compacta` — só o SKU (pedido da supervisão), em 2 colunas de 14, 28 itens por
    etiqueta; cliente e transportadora em uma linha; rodapé igual.

Substitui o que hoje é escrito a pincel na caixa (volumes + itens +
transportadora + dados do pedido) e absorve a *carta de transporte* (folha A4
que ia junto com a mercadoria) como rodapé em fonte pequena.
"""
from collections import defaultdict

from django.utils import timezone

from apps.pedidos.models import Pedido, PedidoItem, Volume, VolumeItem

# Quantos itens cabem numa etiqueta, por modelo — igual no ZPL e no HTML.
# padrao: 2 linhas de 43 dots por item; compacta: 2 colunas × 14 linhas de 32 dots.
MODELOS = {
    'padrao': {'label': 'Padrão (descrição + SKU, 8 por etiqueta)', 'itens_por_pagina': 8, 'colunas': 1},
    'compacta': {'label': 'Compacta (só SKU, 2 colunas, 28 por etiqueta)', 'itens_por_pagina': 28, 'colunas': 2},
}
MODELO_PADRAO = 'padrao'
ITENS_POR_PAGINA = MODELOS[MODELO_PADRAO]['itens_por_pagina']


def normalizar_modelo(valor: str | None) -> str:
    """Nome de modelo válido (qualquer coisa desconhecida vira o padrão)."""
    valor = (valor or '').strip().lower()
    return valor if valor in MODELOS else MODELO_PADRAO

# Texto fixo da antiga "carta de transporte" (docx da expedição, 2026-10-07)
RODAPE_TITULO = 'TRANSPORTE E CONFERÊNCIA DE MERCADORIA'
# Linha própria (não cabe junto do título em 10 cm — no HTML virava "responsabilidade…")
RODAPE_SUBTITULO = 'É de responsabilidade do lojista:'
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


def dados_etiquetas(pedido: Pedido, modelo: str = MODELO_PADRAO) -> dict:
    """Tudo que vai impresso, em estrutura neutra (JSON-serializável).

    `modelo` só muda a paginação (quantos itens por etiqueta) e vai no retorno
    para o ZPL e o HTML desenharem o layout certo.
    """
    modelo = normalizar_modelo(modelo)
    por_pagina = MODELOS[modelo]['itens_por_pagina']
    volumes = list(
        pedido.volumes.order_by('criado_em', 'id').prefetch_related('itens__pedido_item')
    )
    # Só volumes com mercadoria viram caixa física — volume aberto e vazio não imprime
    com_itens = [v for v in volumes if v.itens.exists()]
    total = len(com_itens)

    etiquetas = []
    for numero, volume in enumerate(com_itens, start=1):
        itens = _itens_do_volume(volume)
        paginas = _paginar(itens, por_pagina)
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
        'modelo': modelo,
        'modelo_label': MODELOS[modelo]['label'],
        'itens_por_pagina': por_pagina,
        'colunas': MODELOS[modelo]['colunas'],
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
            'subtitulo': RODAPE_SUBTITULO,
            'responsabilidades': RODAPE_RESPONSABILIDADES,
            'empresa': RODAPE_EMPRESA,
        },
        'gerado_em': timezone.now(),
    }
