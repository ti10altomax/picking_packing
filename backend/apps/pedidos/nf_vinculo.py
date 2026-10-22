"""Vínculo pedido → nota fiscal emitida (2026-10-22).

O sync importa pedidos abertos (E120PED) e NFs *sem* pedido de origem (E140NFV). A NF que
nasce de um pedido NÃO entra como documento próprio — é a mesma venda, conferida como
pedido. Para a carta de correção (ponto 6 da diretoria) o Separa precisa saber qual NF
saiu de cada pedido: só NF autorizada aceita CC-e, e a maioria das notas da Altomax vem
de pedido (caso real: NF 147911 ← pedido 184186).

Fonte: E140IPV (itens da NF) carrega `filped`/`numped` do pedido de origem. Lemos em lote
no beat `vincular_nfs_pedidos` (pedidos em andamento ainda sem nota) e sob demanda ao abrir
a carta de correção. De carona, a NF é a palavra final sobre transportadora e frete:
pedido sem `codtra`/`frete` ganha o da nota (a transportadora costuma só aparecer no
faturamento).

Leitura só — nada é escrito no Oracle.
"""
import logging

from django.utils import timezone

from .models import Pedido

logger = logging.getLogger(__name__)


def _s(v) -> str:
    return str(v or '').strip()


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def aplicar_vinculo(pedido: Pedido, row: dict) -> dict:
    """Preenche `nf_*` (e transportadora/frete vazios) a partir de uma linha do Oracle.
    Devolve o que mudou: {'nf', 'transportadora', 'frete'}. Só salva se algo mudou."""
    from apps.senior.tasks import _transportadora

    campos: list[str] = []
    mudou = {'nf': False, 'transportadora': False, 'frete': False}

    numnfv = _s(_int(row.get('numnfv')))
    codsnf = _s(row.get('codsnf'))
    codfil = _s(_int(row.get('codfil')))
    if numnfv and codsnf and (pedido.nf_numero, pedido.nf_codsnf, pedido.nf_codfil) != (numnfv, codsnf, codfil):
        pedido.nf_codfil, pedido.nf_codsnf, pedido.nf_numero = codfil, codsnf, numnfv
        pedido.nf_vinculada_em = timezone.now()
        campos += ['nf_codfil', 'nf_codsnf', 'nf_numero', 'nf_vinculada_em']
        mudou['nf'] = True

    if not pedido.codtra:
        codtra, nome = _transportadora(row)
        if codtra:
            pedido.codtra, pedido.transportadora = codtra, nome
            campos += ['codtra', 'transportadora']
            mudou['transportadora'] = True

    if not pedido.frete:
        ciffob = _s(row.get('ciffob')).upper()
        if ciffob in dict(Pedido.Frete.choices):
            pedido.frete = ciffob
            campos.append('frete')
            mudou['frete'] = True

    if campos:
        pedido.save(update_fields=campos)
        if mudou['nf']:
            # debug: no primeiro lote são centenas; o resumo sai no INFO da task
            logger.debug('pedido vinculado à NF', extra={
                'pedido': pedido.id, 'numero': pedido.numero_externo, 'nf': numnfv, 'serie': codsnf,
            })
    return mudou


def _mesma_filial(pedido: Pedido, row: dict) -> bool:
    filped = _s(_int(row.get('filped')))
    return not pedido.codfil or not filped or pedido.codfil == filped


def vincular_em_lote(pedidos) -> dict:
    """Pedidos (tipo=pedido) ainda sem NF → consulta E140IPV em blocos e vincula.

    Devolve {'consultados', 'vinculados', 'transportadoras', 'falha_oracle', 'alterados'},
    onde `alterados` é [(pedido, mudou)] para quem chama reagir (ex.: etiqueta de volume
    de um Conferido que acabou de ganhar transportadora)."""
    from apps.senior.oracle import QUERY_NFS_DOS_PEDIDOS
    from apps.senior.tasks import _blocos, _oracle_fetch_safe

    alvo = [p for p in pedidos
            if p.tipo == Pedido.Tipo.PEDIDO and not p.nf_numero and _s(p.numero_externo).isdigit()]
    resultado = {'consultados': len(alvo), 'vinculados': 0, 'transportadoras': 0,
                 'falha_oracle': False, 'alterados': []}
    if not alvo:
        return resultado

    por_numero: dict[str, list[Pedido]] = {}
    for p in alvo:
        por_numero.setdefault(_s(p.numero_externo), []).append(p)

    for bloco in _blocos(sorted(por_numero, key=int)):
        placeholders = ','.join(':' + str(i + 1) for i in range(len(bloco)))
        rows = _oracle_fetch_safe(QUERY_NFS_DOS_PEDIDOS.format(placeholders=placeholders), [int(n) for n in bloco])
        if rows is None:
            resultado['falha_oracle'] = True
            return resultado
        for row in rows:
            numped = _s(_int(row.get('numped')))
            for pedido in por_numero.get(numped, []):
                if not _mesma_filial(pedido, row):
                    continue
                mudou = aplicar_vinculo(pedido, row)
                resultado['vinculados'] += int(mudou['nf'])
                resultado['transportadoras'] += int(mudou['transportadora'])
                if any(mudou.values()):
                    resultado['alterados'].append((pedido, mudou))
    return resultado


def descobrir_nf(pedido: Pedido) -> dict | None:
    """Sob demanda (carta de correção): vincula a NF de UM pedido, se já emitida.
    Devolve a linha do Oracle ou None. Levanta se o Oracle estiver fora — quem chama decide."""
    from apps.senior.oracle import QUERY_NFS_DOS_PEDIDOS, fetch

    if pedido.tipo != Pedido.Tipo.PEDIDO or not _s(pedido.numero_externo).isdigit():
        return None
    rows = [r for r in fetch(QUERY_NFS_DOS_PEDIDOS.format(placeholders=':1'), [int(pedido.numero_externo)])
            if _mesma_filial(pedido, r)]
    if not rows:
        return None
    if len(rows) > 1:
        logger.warning('pedido com mais de uma NF fechada; usando a mais recente',
                       extra={'pedido': pedido.id, 'nfs': [_int(r.get('numnfv')) for r in rows]})
        rows.sort(key=lambda r: (_int(r.get('numnfv')) or 0), reverse=True)
    aplicar_vinculo(pedido, rows[0])
    return rows[0]


def pedidos_da_nf(numnfv) -> list[dict]:
    """Pedidos de origem de um número de NF (E140IPV) — busca por número da nota."""
    from apps.senior.oracle import QUERY_PEDIDOS_DA_NF, fetch

    return fetch(QUERY_PEDIDOS_DA_NF, [int(numnfv)])
