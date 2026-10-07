"""Gerador ZPL da etiqueta de volume (10x15 cm, desenhada a 203 dpi).

Recebe a estrutura de `etiqueta.dados_etiquetas()` e devolve o ZPL de todas as
etiquetas do pedido, uma `^XA…^XZ` por volume/página. Coordenadas são pensadas
para 800x1200 dots (100x150 mm a 203 dpi) e escaladas pelo dpi/tamanho da
impressora cadastrada.

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
M = 24    # margem lateral

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


def _cabem(largura_dots: int, fonte: int, linhas: int = 1) -> int:
    """Quantos caracteres cabem (estimativa conservadora para a fonte 0 da Zebra,
    largura média ~0.46 da altura)."""
    por_linha = int(largura_dots / (fonte * 0.46))
    return max(1, por_linha * linhas - (2 if linhas > 1 else 0))


class _Canvas:
    """Acumula comandos já escalados para o dpi/tamanho da impressora."""

    def __init__(self, dpi: int, largura_mm: int, altura_mm: int):
        self.fx = (largura_mm / LARGURA_MM_BASE) * (dpi / DPI_BASE)
        self.fy = (altura_mm / ALTURA_MM_BASE) * (dpi / DPI_BASE)
        self.ff = min(self.fx, self.fy)
        self.cmds: list[str] = []
        self.pw = round(W * self.fx)
        self.ll = round(H * self.fy)

    def x(self, v):
        return round(v * self.fx)

    def y(self, v):
        return round(v * self.fy)

    def f(self, v):
        return max(10, round(v * self.ff))

    def texto(self, x, y, tam, valor, *, largura=None, linhas=1, alinh='L'):
        maximo = _cabem(largura, tam, linhas) if largura else None
        fd = _txt(valor, maximo)
        if not fd:
            return
        bloco = f'^FB{self.x(largura)},{linhas},0,{alinh}' if largura else ''
        self.cmds.append(f'^FO{self.x(x)},{self.y(y)}{bloco}^A0N,{self.f(tam)},{self.f(tam)}^FD{fd}^FS')

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
        return f'^XA\n^PW{self.pw}\n^LL{self.ll}\n^LH0,0\n{corpo}\n^PQ1\n^XZ\n'


def _etiqueta_zpl(dados: dict, et: dict, dpi: int, largura_mm: int, altura_mm: int) -> str:
    p = dados['pedido']
    vol = et['volume']
    c = _Canvas(dpi, largura_mm, altura_mm)
    CW = W - 2 * M          # 752
    X2 = W - M              # 776
    XR = 460                # coluna direita (caixa do volume / código de barras)
    WR = X2 - XR            # 316

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
    c.linha(M, 884, CW)

    # --- Rodapé: antiga carta de transporte -------------------------------------
    rod = dados['rodape']
    c.texto(M, 892, 22, f"{rod['titulo']}  -  responsabilidade do lojista", largura=CW)
    y = 918
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

    return c.render()


def gerar_zpl(dados: dict, *, dpi: int = DPI_BASE, largura_mm: int = LARGURA_MM_BASE,
              altura_mm: int = ALTURA_MM_BASE) -> str:
    """ZPL de todas as etiquetas do pedido (uma ^XA…^XZ por volume/página)."""
    return ''.join(
        _etiqueta_zpl(dados, et, dpi, largura_mm, altura_mm) for et in dados['etiquetas']
    )
