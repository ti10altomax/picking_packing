"""Gerador ZPL da etiqueta de volume (10x15 cm, desenhada a 203 dpi).

Recebe a estrutura de `etiqueta.dados_etiquetas()` e devolve o ZPL de todas as
etiquetas do pedido, uma `^XA…^XZ` por volume/página. O desenho depende de
`dados['modelo']`: `padrao` (descrição + SKU, 10 itens) ou `compacta` (só SKU em
18 linhas x 2 ou 3 colunas) — cabeçalho e rodapé são os mesmos nos dois. Coordenadas são pensadas
para 800x1200 dots (100x150 mm a 203 dpi) e escaladas pelo dpi/tamanho da
impressora cadastrada. Desde 2026-10-26 o desenho inteiro é deslocado
`MARGEM_IMPRESSORA_MM` para a direita e para baixo (`^LH`) e encolhido para
continuar cabendo: na impressora real a origem fica em cima do corte da
etiqueta — o topo saía no limite e a borda esquerda comia metade do "A" de
ALTOMAX.

Texto vai em ASCII puro, de propósito: firmware antigo de Zebra (GK420 etc.)
não tem fonte Unicode e imprime lixo com ^CI28. E o `^FB` da Zebra não trunca —
o que passa do número de linhas é desenhado por cima da última —, então todo
campo é cortado aqui no Python pelo número de caracteres que cabe na fonte.
"""
import unicodedata

from django.utils import timezone

LARGURA_MM_BASE = 100
ALTURA_MM_BASE = 150
DPI_BASE = 203
W = 800   # dots @203dpi
H = 1200
M = 24    # margem lateral (no desenho; a da impressora é MARGEM_IMPRESSORA_MM)
MARGEM_IMPRESSORA_MM = 3   # folga real em cima e à esquerda, medida na etiqueta impressa

_TROCAS = str.maketrans({
    '·': '-', '•': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
    'º': 'o', 'ª': 'a', '°': 'o', '^': ' ', '~': '-', chr(92): '/',
})


def _txt(valor, maximo: int | None = None) -> str:
    """ASCII seguro para ^FD, cortado em `maximo` caracteres (com '.' no fim)."""
    s = str(valor or '').translate(_TROCAS)
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.encode('ascii', 'ignore').decode('ascii')
    s = ' '.join(s.split())
    if maximo and len(s) > maximo:
        s = s[:maximo - 1].rstrip() + '.'
    return s


def _cabem(largura_dots: int, fonte: int, linhas: int = 1, fator: float = 0.46) -> int:
    """Quantos caracteres cabem (estimativa para a fonte 0 da Zebra: largura média
    ~0.46 da altura em texto normal; medido no Labelary em 2026-10-23, maiúsculas
    e dígitos chegam a ~0.60 — por isso o `fator` é ajustável por campo)."""
    por_linha = int(largura_dots / (fonte * fator))
    return max(1, por_linha * linhas - (2 if linhas > 1 else 0))


class _Canvas:
    """Acumula comandos já escalados para o dpi/tamanho da impressora."""

    def __init__(self, dpi: int, largura_mm: int, altura_mm: int):
        self.pw = round(W * (largura_mm / LARGURA_MM_BASE) * (dpi / DPI_BASE))
        self.ll = round(H * (altura_mm / ALTURA_MM_BASE) * (dpi / DPI_BASE))
        # Origem (^LH) afastada do corte; o desenho de WxH é escalado para a
        # área que sobra, então nada sai pela direita nem pelo rodapé.
        self.ox = round(MARGEM_IMPRESSORA_MM * dpi / 25.4)
        self.oy = round(MARGEM_IMPRESSORA_MM * dpi / 25.4)
        self.fx = (self.pw - self.ox) / W
        self.fy = (self.ll - self.oy) / H
        self.ff = min(self.fx, self.fy)
        self.cmds: list[str] = []

    def x(self, v):
        return round(v * self.fx)

    def y(self, v):
        return round(v * self.fy)

    def f(self, v):
        return max(10, round(v * self.ff))

    def texto(self, x, y, tam, valor, *, largura=None, linhas=1, alinh='L',
              largura_fonte=None, fator=0.46):
        """`largura_fonte` < `tam` condensa a fonte (mesma altura, caracteres mais
        estreitos); `fator` é a largura média do caractere usada para truncar."""
        lf = largura_fonte or tam
        maximo = _cabem(largura, lf, linhas, fator) if largura else None
        fd = _txt(valor, maximo)
        if not fd:
            return
        bloco = f'^FB{self.x(largura)},{linhas},0,{alinh}' if largura else ''
        self.cmds.append(f'^FO{self.x(x)},{self.y(y)}{bloco}^A0N,{self.f(tam)},{self.f(lf)}^FD{fd}^FS')

    def linha(self, x, y, largura, espessura=2):
        e = max(1, self.y(espessura))
        self.cmds.append(f'^FO{self.x(x)},{self.y(y)}^GB{self.x(largura)},{e},{e}^FS')

    def caixa(self, x, y, largura, altura, espessura=3):
        e = max(1, round(espessura * self.ff))
        self.cmds.append(f'^FO{self.x(x)},{self.y(y)}^GB{self.x(largura)},{self.y(altura)},{e}^FS')

    def code128(self, x, y, altura, valor):
        fd = _txt(valor)
        if not fd:
            return
        modulo = max(1, round(2 * self.ff))
        h = self.y(altura)
        self.cmds.append(f'^FO{self.x(x)},{self.y(y)}^BY{modulo},3,{h}^BCN,{h},N,N,N^FD{fd}^FS')

    def render(self) -> str:
        corpo = '\n'.join(self.cmds)
        return f'^XA\n^PW{self.pw}\n^LL{self.ll}\n^LH{self.ox},{self.oy}\n{corpo}\n^PQ1\n^XZ\n'


CW = W - 2 * M          # 752 — largura útil
X2 = W - M              # 776 — borda direita
XR = 460                # coluna direita (caixa do volume / código de barras)
WR = X2 - XR            # 316


def _cabecalho(c: _Canvas, dados: dict, et: dict) -> None:
    """Marca + caixa "VOLUME N / M" + documento com Code 128 (igual nos dois modelos).

    2026-10-26: "pag. N/M" em vez de "cont."; NF ao lado do número do pedido quando
    já existe; o código de barras leva a NF (ou o pedido, se ainda não faturado) e
    ganha "NF 123456" / "PEDIDO 123456" pequeno embaixo.
    """
    p = dados['pedido']
    vol = et['volume']
    barra = dados['barra']

    # --- Cabeçalho: marca + caixa "VOLUME N / M" -------------------------------
    c.texto(M, 22, 64, 'ALTOMAX')
    c.caixa(XR, 16, WR, 92)
    rotulo = 'VOLUME'
    if et['total_paginas'] > 1:
        rotulo = f"VOLUME - pag. {et['pagina']}/{et['total_paginas']}"
    c.texto(XR, 22, 24, rotulo, largura=WR, alinh='C')
    c.texto(XR, 48, 56, f"{vol['numero']} / {dados['total_volumes']}", largura=WR, alinh='C')
    c.linha(M, 118, CW)

    # --- Documento + código de barras + cliente ----------------------------------
    if p['tipo'] == 'nota_fiscal':
        cab = 'NOTA FISCAL' + (f" - serie {p['codsnf']}" if p['codsnf'] else '')
    else:
        cab = 'PEDIDO'
    if p.get('codfil'):
        cab += f" - filial {p['codfil']}"
    largura_doc = XR - M - 10                       # 426 — coluna do documento
    numero = _txt(p['numero_externo'])
    c.texto(M, 130, 24, cab, largura=largura_doc)
    c.texto(M, 158, 64, numero, largura=largura_doc, fator=0.60)
    nf = p.get('nf_numero')
    if nf:
        # "NF 147911" à direita do número do pedido, na largura que sobrar (dígitos
        # na fonte 0 medem ~0.60 da altura; condensa até caber, sem descer de 18)
        x_nf = M + int(len(numero) * 64 * 0.60) + 12
        sobra = XR - 10 - x_nf
        texto_nf = f'NF {nf}'
        lf = max(18, min(30, int(sobra / (len(texto_nf) * 0.60))))
        c.texto(x_nf, 180, 40, texto_nf, largura=sobra, largura_fonte=lf, fator=0.60)
    c.code128(XR, 128, 70, barra['valor'])
    c.texto(XR, 202, 16, f"{barra['rotulo']} {barra['valor']}", largura=WR, alinh='C', fator=0.60)


RODAPE_Y = 972   # linha que abre o rodapé; ele termina em ~1172 (folga até 1200)


def _rodape(c: _Canvas, dados: dict, y0: int = RODAPE_Y) -> None:
    """Antiga carta de transporte + linha "Conferido em" (igual nos dois modelos).
    Sem as 2 linhas de endereço/telefone desde 2026-10-26 — o espaço virou itens."""
    p = dados['pedido']
    c.linha(M, y0, CW)

    # --- Rodapé: antiga carta de transporte -------------------------------------
    # Título e "É de responsabilidade do lojista:" em linhas separadas — juntos
    # passam da largura e o ^FB desenharia o excesso por cima da linha seguinte.
    rod = dados['rodape']
    c.texto(M, y0 + 8, 22, rod['titulo'], largura=CW)
    c.texto(M, y0 + 32, 20, rod['subtitulo'], largura=CW)
    y = y0 + 56
    for texto in rod['responsabilidades']:
        c.texto(M, y, 18, f'- {texto}', largura=CW)
        y += 22
    c.linha(M, y + 6, CW, 1)

    conferido = p['conferido_em']
    if conferido:
        conferido = timezone.localtime(conferido).strftime('%d/%m/%Y %H:%M')
    extras = [f'Conferido em {conferido}' if conferido else 'Conferencia concluida']
    if p.get('conferente'):
        extras.append(f"por {p['conferente']}")
    if p.get('sequencia_numero'):
        extras.append(f"Seq. {p['sequencia_numero']}")
    extras.append('Separa')
    c.texto(M, y + 14, 20, ' - '.join(extras), largura=CW)


PADRAO_PASSO = 42   # altura de cada item (descrição 24 + SKU 16); 10 itens = 534..954


def _etiqueta_padrao(dados: dict, et: dict, dpi: int, largura_mm: int, altura_mm: int) -> str:
    """Modelo original (2026-10-07): descrição + SKU por item; 10 itens por etiqueta
    desde 2026-10-26 (eram 8 — o rodapé encolheu)."""
    p = dados['pedido']
    vol = et['volume']
    c = _Canvas(dpi, largura_mm, altura_mm)
    _cabecalho(c, dados, et)
    c.texto(M, 232, 30, p['cliente'] or '-', largura=CW, linhas=2)
    c.linha(M, 306, CW)

    # --- Transportadora (o dado que o pátio precisa ler de longe) ---------------
    c.texto(M, 316, 24, 'TRANSPORTADORA')
    c.texto(M, 342, 50, p['transportadora'] or '-', largura=CW, linhas=2)
    c.linha(M, 456, CW)

    # --- Volume: tipo, identificador, totais ------------------------------------
    partes = [vol['tipo_label'].upper()]
    if vol['identificador']:
        partes.append(vol['identificador'])
    partes.append(f"{et['qtd_unidades']} unid. em {et['qtd_itens']} item(ns)")
    c.texto(M, 466, 28, '  -  '.join(partes), largura=CW)
    c.texto(M, 502, 22, 'ITEM')
    c.texto(X2 - 120, 502, 22, 'QTD', largura=120, alinh='R')
    c.linha(M, 526, CW, 1)

    # 10 itens por etiqueta (etiqueta.MODELOS['padrao']), 2 linhas cada: descrição + SKU
    y = 534
    for item in et['itens']:
        c.texto(M, y, 24, item.get('descricao') or item.get('sku') or '-', largura=CW - 130)
        c.texto(M, y + 25, 16, item.get('sku') or '', largura=CW - 130)
        c.texto(X2 - 120, y + 2, 34, item['qtd'], largura=120, alinh='R')
        y += PADRAO_PASSO
    if not et['itens']:
        c.texto(M, y, 24, '(volume sem itens)')
    _rodape(c, dados)
    return c.render()


# Modelo compacto: itens em 2 ou 3 colunas, uma linha por item (só o SKU)
COMPACTA_LINHAS = 18          # linhas por coluna (etiqueta.MODELOS['compacta']['linhas'])
COMPACTA_PASSO = 30           # altura de cada linha em dots (18 linhas = 410..950)
COMPACTA_Y0 = 410             # primeira linha de item
# Por número de colunas: vão entre colunas e largura reservada à quantidade. A fonte
# do SKU é a MESMA (24/20) nos dois casos — ordem da supervisão: não diminuir. Por isso
# 3 colunas só entram com quantidades de até 2 dígitos e SKUs de até 16 caracteres
# (etiqueta.colunas_do_volume): 16 x 0.61 x 20 = 195 dots cabem nos 198 da coluna de 3
# (244 de largura - 40 da quantidade - 6 de respiro).
COMPACTA_SKU_FONTE = (24, 20)   # altura, largura
COMPACTA_GEOMETRIA = {
    2: {'gap': 16, 'wq': 72, 'pad': 8},
    3: {'gap': 10, 'wq': 40, 'pad': 6},
}


def _etiqueta_compacta(dados: dict, et: dict, dpi: int, largura_mm: int, altura_mm: int) -> str:
    """Modelo compacto (2026-10-23, pedido da supervisão): só o SKU, em colunas de 18.

    Cliente e transportadora ficam em uma linha cada (fonte menor, sem a
    segunda linha reservada), o que libera o espaço que o modelo padrão deixava
    vazio abaixo deles. 2026-10-26: 18 linhas (eram 14) e 3 colunas quando
    nenhuma quantidade do volume passa de 99 nem SKU de 16 caracteres (mesma fonte). Cabeçalho e rodapé são os mesmos do padrão.
    """
    p = dados['pedido']
    vol = et['volume']
    c = _Canvas(dpi, largura_mm, altura_mm)
    _cabecalho(c, dados, et)

    # --- Cliente (1 linha) + transportadora (1 linha, ainda grande) --------------
    # Fatores medidos no Labelary (maiúsculas): 28/26 → ~12.8 dots por caractere,
    # 44 → ~23.8; o ^FB não trunca, então o corte é feito aqui com folga.
    c.texto(M, 226, 28, p['cliente'] or '-', largura=CW, largura_fonte=26, fator=0.50)
    c.linha(M, 258, CW)
    c.texto(M, 266, 20, 'TRANSPORTADORA')
    c.texto(M, 288, 44, p['transportadora'] or '-', largura=CW, fator=0.55)
    c.linha(M, 340, CW)

    # --- Volume: tipo, identificador, totais ------------------------------------
    partes = [vol['tipo_label'].upper()]
    if vol['identificador']:
        partes.append(vol['identificador'])
    partes.append(f"{et['qtd_unidades']} unid. em {et['qtd_itens']} item(ns)")
    c.texto(M, 348, 26, '  -  '.join(partes), largura=CW, fator=0.52)

    # --- Itens em colunas (enche a 1a de cima a baixo, depois a 2a, depois a 3a)
    n_col = 3 if et.get('colunas') == 3 else 2
    g = COMPACTA_GEOMETRIA[n_col]
    wc = (CW - g['gap'] * (n_col - 1)) // n_col                # 368 (2 col) / 244 (3 col)
    xs = [M + i * (wc + g['gap']) for i in range(n_col)]
    y_fim = COMPACTA_Y0 + COMPACTA_LINHAS * COMPACTA_PASSO     # 950
    w_sku = wc - g['wq'] - g['pad']                            # 288 (2 col) / 198 (3 col)
    # Fonte da quantidade: 28 de altura, condensada se a maior quantidade da etiqueta não couber
    maior_qtd = max((len(str(i['qtd'])) for i in et['itens']), default=1)
    lf_qtd = max(14, min(28, int(g['wq'] / (maior_qtd * 0.62))))
    usadas = min(n_col, -(-len(et['itens']) // COMPACTA_LINHAS)) if et['itens'] else 1
    for x in xs[:usadas]:
        c.texto(x, 380, 20, 'SKU')
        c.texto(x + wc - g['wq'], 380, 20, 'QTD', largura=g['wq'], alinh='R')
    c.linha(M, 402, CW, 1)
    for k in range(1, usadas):
        x_sep = xs[k] - g['gap'] // 2
        c.cmds.append(f'^FO{c.x(x_sep)},{c.y(380)}^GB1,{c.y(y_fim - 380)},1^FS')

    for k, item in enumerate(et['itens']):
        col, lin = divmod(k, COMPACTA_LINHAS)
        if col >= n_col:
            break   # não acontece: a paginação em etiqueta.py usa linhas x colunas
        x = xs[col]
        y = COMPACTA_Y0 + lin * COMPACTA_PASSO
        c.texto(x, y + 2, COMPACTA_SKU_FONTE[0], item.get('sku') or item.get('descricao') or '-',
                largura=w_sku, largura_fonte=COMPACTA_SKU_FONTE[1], fator=0.61)
        c.texto(x + wc - g['wq'], y, 28, item['qtd'], largura=g['wq'], alinh='R',
                largura_fonte=lf_qtd, fator=0.62)
    if not et['itens']:
        c.texto(M, COMPACTA_Y0, 24, '(volume sem itens)')

    _rodape(c, dados)
    return c.render()


_DESENHOS = {'padrao': _etiqueta_padrao, 'compacta': _etiqueta_compacta}


def gerar_zpl(dados: dict, *, dpi: int = DPI_BASE, largura_mm: int = LARGURA_MM_BASE,
              altura_mm: int = ALTURA_MM_BASE) -> str:
    """ZPL de todas as etiquetas do pedido (uma ^XA…^XZ por volume/página)."""
    desenho = _DESENHOS.get(dados.get('modelo') or 'padrao', _etiqueta_padrao)
    return ''.join(
        desenho(dados, et, dpi, largura_mm, altura_mm) for et in dados['etiquetas']
    )
