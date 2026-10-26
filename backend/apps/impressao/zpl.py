"""Gerador ZPL da etiqueta de volume (10x15 cm, desenhada a 203 dpi).

Recebe a estrutura de `etiqueta.dados_etiquetas()` e devolve o ZPL de todas as
etiquetas do pedido, uma `^XA…^XZ` por volume/página. O desenho depende de
`dados['modelo']`: `padrao` (descrição + SKU, 8 itens) ou `compacta` (só SKU em
2 colunas, 28 itens) — cabeçalho e rodapé são os mesmos nos dois. Coordenadas são pensadas
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
    """Marca + caixa "VOLUME N / M" + documento com Code 128 (igual nos dois modelos)."""
    p = dados['pedido']
    vol = et['volume']

    # --- Cabeçalho: marca + caixa "VOLUME N / M" -------------------------------
    c.texto(M, 22, 64, 'ALTOMAX')
    c.caixa(XR, 16, WR, 92)
    rotulo = 'VOLUME'
    if et['total_paginas'] > 1:
        rotulo = f"VOLUME - cont. {et['pagina']}/{et['total_paginas']}"
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
    c.texto(M, 130, 24, cab, largura=XR - M - 10)
    c.texto(M, 158, 64, p['numero_externo'], largura=XR - M - 10)
    c.code128(XR, 128, 70, p['numero_externo'])


def _rodape(c: _Canvas, dados: dict) -> None:
    """Antiga carta de transporte + linha "Conferido em" (igual nos dois modelos)."""
    p = dados['pedido']
    c.linha(M, 884, CW)

    # --- Rodapé: antiga carta de transporte -------------------------------------
    # Título e "É de responsabilidade do lojista:" em linhas separadas — juntos
    # passam da largura e o ^FB desenharia o excesso por cima da linha seguinte.
    rod = dados['rodape']
    c.texto(M, 892, 22, rod['titulo'], largura=CW)
    c.texto(M, 916, 20, rod['subtitulo'], largura=CW)
    y = 940
    for texto in rod['responsabilidades']:
        c.texto(M, y, 18, f'- {texto}', largura=CW)
        y += 22
    y += 6
    for texto in rod['empresa']:
        c.texto(M, y, 18, texto, largura=CW)
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


def _etiqueta_padrao(dados: dict, et: dict, dpi: int, largura_mm: int, altura_mm: int) -> str:
    """Modelo original (2026-10-07): descrição + SKU por item, 8 itens por etiqueta."""
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

    # 8 itens por etiqueta (etiqueta.ITENS_POR_PAGINA), 2 linhas cada: descrição + SKU
    y = 534
    for item in et['itens']:
        c.texto(M, y, 24, item.get('descricao') or item.get('sku') or '-', largura=CW - 130)
        c.texto(M, y + 25, 16, item.get('sku') or '', largura=CW - 130)
        c.texto(X2 - 120, y + 2, 34, item['qtd'], largura=120, alinh='R')
        y += 43
    if not et['itens']:
        c.texto(M, y, 24, '(volume sem itens)')
    _rodape(c, dados)
    return c.render()


# Modelo compacto: itens em 2 colunas, uma linha por item (só o SKU)
COMPACTA_LINHAS = 14          # linhas por coluna (× 2 colunas = etiqueta.MODELOS['compacta'])
COMPACTA_PASSO = 32           # altura de cada linha em dots
COMPACTA_Y0 = 410             # primeira linha de item
COMPACTA_GAP = 16             # vão entre as colunas
COMPACTA_WQ = 64              # largura reservada à quantidade (4 dígitos na fonte 28)


def _etiqueta_compacta(dados: dict, et: dict, dpi: int, largura_mm: int, altura_mm: int) -> str:
    """Modelo compacto (2026-10-23, pedido da supervisão): só o SKU, em 2 colunas de 14.

    Cliente e transportadora ficam em uma linha cada (fonte menor, sem a
    segunda linha reservada), o que libera o espaço que o modelo padrão deixava
    vazio abaixo deles. Cabeçalho e rodapé são os mesmos do padrão.
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

    # --- Itens em 2 colunas (preenche a esquerda de cima a baixo, depois a direita)
    # SKU na fonte 24 condensada a 20 de largura: 22 caracteres (o maior SKU) = 266
    # dots, cabe na coluna de 296 sem truncar; a 24/24 passaria de 300.
    wc = (CW - COMPACTA_GAP) // 2                       # 368 — largura de cada coluna
    xs = (M, M + wc + COMPACTA_GAP)                     # 24, 408
    x_sep = M + wc + COMPACTA_GAP // 2                  # 400 — divisória vertical
    y_fim = COMPACTA_Y0 + COMPACTA_LINHAS * COMPACTA_PASSO   # 858
    w_sku = wc - COMPACTA_WQ - 8                        # 296
    duas_colunas = len(et['itens']) > COMPACTA_LINHAS
    for x in xs[: 2 if duas_colunas else 1]:
        c.texto(x, 380, 20, 'SKU')
        c.texto(x + wc - COMPACTA_WQ, 380, 20, 'QTD', largura=COMPACTA_WQ, alinh='R')
    c.linha(M, 402, CW, 1)
    if duas_colunas:
        c.cmds.append(f'^FO{c.x(x_sep)},{c.y(380)}^GB1,{c.y(y_fim - 380)},1^FS')

    for i, item in enumerate(et['itens']):
        col, lin = divmod(i, COMPACTA_LINHAS)
        x = xs[col]
        y = COMPACTA_Y0 + lin * COMPACTA_PASSO
        c.texto(x, y + 2, 24, item.get('sku') or item.get('descricao') or '-',
                largura=w_sku, largura_fonte=20, fator=0.61)
        c.texto(x + wc - COMPACTA_WQ, y, 28, item['qtd'], largura=COMPACTA_WQ, alinh='R', fator=0.55)
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
