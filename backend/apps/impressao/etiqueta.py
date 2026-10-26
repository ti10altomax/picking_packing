"""Conteúdo da etiqueta de volume (10x15 cm) — independente do destino.

Monta a estrutura que o gerador ZPL (`zpl.py`) e a página HTML do frontend
renderizam. Uma etiqueta por volume com itens; volume com mais itens do que
cabe gera páginas de continuação (mesmo "Volume N de M", "pág. 2/3").

Dois modelos (2026-10-23, `Configuracao.etiqueta_modelo`), mesmos dados:
  - `padrao`   — descrição + SKU por item, 10 itens por etiqueta (o desenho original);
  - `compacta` — só o SKU (pedido da supervisão), em 18 linhas × 2 ou 3 colunas
    (36 ou 54 por etiqueta); cliente e transportadora em uma linha; rodapé igual.

Ajustes de 2026-10-26 (supervisão, depois da etiqueta aprovada): "pág. N/M" em vez
de "cont."; nota fiscal ao lado do pedido e no código de barras quando já existe
(`Pedido.nf_numero`, vínculo pela E140IPV) com "NF"/"PEDIDO" pequeno sob a barra;
rodapé sem as 2 linhas de endereço/telefone da empresa; compacta em 3 colunas
quando nenhuma quantidade do volume tem 3 dígitos e nenhum SKU passa de 16
caracteres (senão 2 colunas) — a fonte dos itens não muda.

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
    'padrao': {'label': 'Padrão (descrição + SKU, 10 por etiqueta)', 'itens_por_pagina': 10, 'colunas': 1, 'linhas': 10},
    'compacta': {'label': 'Compacta (só SKU, 2 ou 3 colunas, até 54 por etiqueta)', 'itens_por_pagina': 54, 'colunas': 3, 'linhas': 18},
}
# Compacta: 3 colunas só se toda quantidade do volume couber em 2 dígitos E todo SKU
# tiver até 16 caracteres — a fonte dos itens NÃO diminui (ordem da supervisão): na
# fonte normal (24/20 no ZPL) 16 caracteres é o que cabe na coluna de 3.
COMPACTA_QTD_MAX_3_COLUNAS = 99
COMPACTA_SKU_MAX_3_COLUNAS = 16
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
# As 2 linhas de endereço/telefone da empresa saíram em 2026-10-26 (pedido da supervisão).


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


def colunas_do_volume(modelo: str, itens: list[dict]) -> int:
    """Compacta: 3 colunas quando toda quantidade do volume tem até 2 dígitos e todo SKU
    até 16 caracteres, sem mexer na fonte; qualquer item com 100+ ou SKU mais longo
    volta para 2 colunas. Padrão: 1."""
    if modelo != 'compacta':
        return 1
    if any((i.get('qtd') or 0) > COMPACTA_QTD_MAX_3_COLUNAS for i in itens):
        return 2
    if any(len(i.get('sku') or '') > COMPACTA_SKU_MAX_3_COLUNAS for i in itens):
        return 2
    return 3


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
    linhas = MODELOS[modelo]['linhas']
    volumes = list(
        pedido.volumes.order_by('criado_em', 'id').prefetch_related('itens__pedido_item')
    )
    # Só volumes com mercadoria viram caixa física — volume aberto e vazio não imprime
    com_itens = [v for v in volumes if v.itens.exists()]
    total = len(com_itens)

    etiquetas = []
    for numero, volume in enumerate(com_itens, start=1):
        itens = _itens_do_volume(volume)
        colunas = colunas_do_volume(modelo, itens)
        por_pagina = linhas * colunas
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
                'colunas': colunas,
                'itens_por_pagina': por_pagina,
                'itens': bloco,
                'qtd_unidades': sum(i['qtd'] for i in itens),
                'qtd_itens': len(itens),
            })

    conferido_em = pedido.conferido_em
    # NF do documento: a própria, se é nota; a vinculada pela E140IPV, se é pedido já faturado.
    # O código de barras leva a NF quando existe (é o que a transportadora procura), senão o pedido.
    if pedido.tipo == Pedido.Tipo.NOTA_FISCAL:
        nf = {'numero': pedido.numero_externo, 'codsnf': pedido.codsnf, 'codfil': pedido.codfil}
    else:
        nf = {'numero': pedido.nf_numero, 'codsnf': pedido.nf_codsnf, 'codfil': pedido.nf_codfil}
    barra = {'valor': nf['numero'] or pedido.numero_externo, 'rotulo': 'NF' if nf['numero'] else 'PEDIDO'}
    return {
        'modelo': modelo,
        'modelo_label': MODELOS[modelo]['label'],
        'itens_por_pagina': MODELOS[modelo]['itens_por_pagina'],   # máximo do modelo; o real é por etiqueta
        'colunas': MODELOS[modelo]['colunas'],
        'linhas': linhas,
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
            # NF ao lado do pedido (vazia enquanto o pedido não foi faturado / vinculado)
            'nf_numero': nf['numero'] if pedido.tipo != Pedido.Tipo.NOTA_FISCAL else '',
            'nf_codsnf': nf['codsnf'] if pedido.tipo != Pedido.Tipo.NOTA_FISCAL else '',
        },
        'barra': barra,
        'total_volumes': total,
        'etiquetas': etiquetas,
        'rodape': {
            'titulo': RODAPE_TITULO,
            'subtitulo': RODAPE_SUBTITULO,
            'responsabilidades': RODAPE_RESPONSABILIDADES,
        },
        'gerado_em': timezone.now(),
    }
