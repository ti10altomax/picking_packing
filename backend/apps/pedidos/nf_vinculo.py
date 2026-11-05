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

Faturamento parcial (2026-11-05): um pedido pode sair em várias notas (168 pedidos com 2+
NFs em 30 dias) e o galpão, na maioria das vezes, confere pela nota. Por isso a NF que sai
de pedido agora também vira documento — a não ser que seja o faturamento de um pedido que
o Separa já está conferindo (Selecionado em diante e ainda sem nota): aí ela só é vinculada,
como antes. `conflito_conferencia_dupla` barra mandar para separação o pedido e a nota dele.

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


# Pedido que o Separa já está conferindo (ou conferiu): a NF que sair dele sem estar vinculada
# ainda é o faturamento dessa conferência — não vira documento novo.
STATUS_EM_CONFERENCIA = (
    Pedido.Status.SELECIONADO,
    Pedido.Status.ATRIBUIDO,
    Pedido.Status.CONFERINDO,
    Pedido.Status.AGUARDANDO_FECHAMENTO,
    Pedido.Status.NAO_CONFORME,
    Pedido.Status.CONFERIDO,
)


def origens_da_linha(valor) -> list[tuple[str, str]]:
    """'1:169011,1:169012' (LISTAGG da QUERY_NF_PENDENTES) → [('1', '169011'), ('1', '169012')]."""
    origens = []
    for parte in _s(valor).split(','):
        filped, _, numped = parte.strip().rpartition(':')
        numped = _s(_int(numped))
        if numped:
            origens.append((_s(_int(filped)), numped))
    return origens


def _pedidos_das_origens(origens):
    qs = Pedido.objects.filter(tipo=Pedido.Tipo.PEDIDO, numero_externo__in=[n for _, n in origens])
    filiais = {n: f for f, n in origens}
    return [p for p in qs if not p.codfil or not filiais.get(p.numero_externo) or p.codfil == filiais[p.numero_externo]]


def nf_e_faturamento_em_conferencia(row: dict, origens) -> list[Pedido]:
    """A NF (linha da QUERY_NF_PENDENTES) é o faturamento de um pedido que o Separa já está
    conferindo? Devolve esses pedidos (vazio = a NF vira documento). Pedido sem nota ou já
    vinculado a ela conta; pedido vinculado a outra nota não — esta é o saldo."""
    numnfv = _s(_int(row.get('numnfv')))
    codsnf = _s(row.get('codsnf'))
    return [
        p for p in _pedidos_das_origens(origens)
        if p.status in STATUS_EM_CONFERENCIA
        and (not p.nf_numero or (p.nf_numero, p.nf_codsnf) == (numnfv, codsnf))
    ]


def _nfs_que_sao_documento(rows) -> set[tuple[str, str]]:
    """(numnfv, codsnf) das linhas que já existem como documento tipo NF no Separa —
    essas são conferidas por si; não são o faturamento de ninguém."""
    numeros = {_s(_int(r.get('numnfv'))) for r in rows} - {''}
    if not numeros:
        return set()
    return set(
        Pedido.objects.filter(tipo=Pedido.Tipo.NOTA_FISCAL, numero_externo__in=numeros)
        .values_list('numero_externo', 'codsnf')
    )


def conflito_conferencia_dupla(doc: Pedido) -> str:
    """Motivo para NÃO mandar `doc` para separação, ou ''. Barra conferir duas vezes a mesma
    mercadoria: o pedido e a nota que saiu dele (faturamento parcial, 2026-11-05)."""
    livres = (Pedido.Status.PENDENTE, Pedido.Status.CANCELADO)
    if doc.tipo == Pedido.Tipo.PEDIDO:
        nfs = (Pedido.objects.filter(tipo=Pedido.Tipo.NOTA_FISCAL, pedidos_origem__contains=[doc.numero_externo])
               .exclude(status__in=livres))
        if doc.codfil:  # numeração é por filial; o pedido sai faturado na própria filial
            nfs = nfs.filter(codfil__in=[doc.codfil, ''])
        nf = nfs.first()
        if nf:
            return f'a NF {nf.numero_externo} desse pedido já está na conferência ({nf.get_status_display()})'
        return ''
    origens = [(doc.codfil, n) for n in doc.pedidos_origem or []]
    for p in _pedidos_das_origens(origens):
        if p.status in livres:
            continue
        if p.status != Pedido.Status.CONFERIDO:
            return f'o pedido {p.numero_externo} dessa NF já está na conferência ({p.get_status_display()})'
        if not p.nf_numero or p.nf_numero == doc.numero_externo:
            return f'o pedido {p.numero_externo} já foi conferido e esta NF é o faturamento dele'
    return ''


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
        # NF que já é documento é conferida por si (saldo de faturamento parcial); entre as
        # demais, a primeira emitida é o faturamento — com várias, a seguinte não sobrescreve.
        documentos = _nfs_que_sao_documento(rows)
        rows = sorted(rows, key=lambda r: (r.get('datemi') is None, r.get('datemi') or 0, _int(r.get('numnfv')) or 0))
        for row in rows:
            if (_s(_int(row.get('numnfv'))), _s(row.get('codsnf'))) in documentos:
                continue
            numped = _s(_int(row.get('numped')))
            for pedido in por_numero.get(numped, []):
                if not _mesma_filial(pedido, row) or pedido.nf_numero:
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
    documentos = _nfs_que_sao_documento(rows)
    rows = [r for r in rows if (_s(_int(r.get('numnfv'))), _s(r.get('codsnf'))) not in documentos]
    if not rows:
        return None
    if len(rows) > 1:
        logger.warning('pedido com mais de uma NF fechada; usando a mais recente',
                       extra={'pedido': pedido.id, 'nfs': [_int(r.get('numnfv')) for r in rows]})
        rows.sort(key=lambda r: (_int(r.get('numnfv')) or 0), reverse=True)
    mudou = aplicar_vinculo(pedido, rows[0])
    if mudou['nf'] or mudou['transportadora']:
        # Mesma consequência do beat: Conferido recente que acabou de ganhar a NF pode
        # imprimir a etiqueta de volume (só se a automática estiver ligada; nunca reimprime).
        from apps.impressao.services import disparar_se_pendente  # lazy: evita ciclo
        try:
            disparar_se_pendente(pedido)
        except Exception:
            logger.exception('etiqueta de volume: falha ao disparar após vínculo sob demanda', extra={'pedido': pedido.id})
    return rows[0]


def pedidos_da_nf(numnfv) -> list[dict]:
    """Pedidos de origem de um número de NF (E140IPV) — busca por número da nota."""
    from apps.senior.oracle import QUERY_PEDIDOS_DA_NF, fetch

    return fetch(QUERY_PEDIDOS_DA_NF, [int(numnfv)])
