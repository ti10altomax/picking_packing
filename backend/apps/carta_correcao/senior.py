"""Leitura (Oracle) e escrita (SOAP) no Senior para a carta de correção.

Leitura — read-only, como todo o resto do projeto:
  - situação da NF (fiscal `sitnfv` e eletrônica `sitdoe`), transportadora e frete atuais;
  - cartas de correção já existentes da nota (a última carta SUBSTITUI as anteriores,
    então o texto novo precisa repeti-las);
  - lista de transportadoras (E073TRA) para o combo.

Escrita — só por SOAP, nunca INSERT/UPDATE no Oracle:
  - `cartadecorrecao.Gravar`: cria a carta (sitCce=1 "Não enviada") e, de carona,
    atualiza transportadora / CIF-FOB da própria NF. Não transmite.
  - `documentofiscal.EmitirCartaCorrecao`: transmite à SEFAZ (gera XML ou fala com o eDocs,
    conforme `tipGer`). Só no modo `gravar_e_transmitir`.

Contratos conferidos no WSDL/XSD real do servidor em 2026-10-22 (ERP 5.10.4.119):
tudo é string exceto `numNfv` (int) no Gravar; `cartaCorrecao` e `cabecalho` são listas.
`SENIOR_WS_DRY_RUN=True` monta o payload e NÃO chama o Senior (padrão fora de produção).

Tabelas conferidas no dicionário do Oracle da Altomax em 2026-10-22:
  - E140IDE: situação eletrônica (`sitdoe`), chave de acesso (`chvdoe`), protocolo/data de
    autorização — mesma chave da NF (codemp, codfil, codsnf, numnfv);
  - E140CCE: eventos da NF-e; `tipeve` 110110 = carta de correção (110111 cancelamento,
    110112 encerramento). `seqeve` ordena; `descor` é o texto; `horeve` são MINUTOS
    desde a meia-noite (520 = 08:40), padrão Senior.
Se alguma consulta falhar, devolve `disponivel=False` + mensagem e o ERP continua
validando tudo no Gravar — nada é gravado com dado errado.
"""
import logging
import re

from django.conf import settings

from apps.senior.oracle import SENIOR_CODEMP, fetch

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Leitura (Oracle, read-only)
# ---------------------------------------------------------------------------

# Situação do documento eletrônico (mesmo domínio do WS): 3 = Autorizada é a única que aceita CC-e.
SITDOE_LABELS = {
    0: 'Não se aplica', 1: 'Não enviada', 2: 'Enviada', 3: 'Autorizada', 4: 'Rejeitada',
    5: 'Denegada', 6: 'Solicitado inutilização', 7: 'Solicitado cancelamento', 8: 'Inutilizada',
    9: 'Cancelada', 10: 'Erro de geração', 11: 'Erro na solicitação de cancelamento',
    12: 'Erro na solicitação de inutilização', 13: 'Pendente de cancelamento',
    16: 'Autorizada em contingência',
}
# 10 = erro (confirmado pela Altomax em 2026-11-23). Desde 19/11/2026 o EmitirCartaCorrecao deixa
# na E140CCE, além da carta que o Gravar criou, uma SEGUNDA linha idêntica (mesmo texto e
# minuto) com sitcce 10 — um "eco" com erro, que não é outra carta.
SITCCE_ERRO = 10
SITCCE_LABELS = {1: 'Não enviada', 2: 'Enviada', 3: 'Autorizada', 4: 'Rejeitada', 5: 'Denegada',
                 SITCCE_ERRO: 'Erro'}

QUERY_SITUACAO_NF = f"""
    SELECT nfv.sitnfv, nfv.codtra, tra.nomtra, nfv.ciffob, nfv.qtdemb,
           ide.sitdoe, ide.chvdoe, ide.numprt, ide.dataut, ide.horaut
    FROM E140NFV nfv
    LEFT JOIN E073TRA tra ON tra.codtra = nfv.codtra
    LEFT JOIN E140IDE ide
        ON ide.codemp = nfv.codemp
       AND ide.codfil = nfv.codfil
       AND ide.codsnf = nfv.codsnf
       AND ide.numnfv = nfv.numnfv
    WHERE nfv.codemp = {SENIOR_CODEMP}
      AND nfv.codfil = :1
      AND nfv.codsnf = :2
      AND nfv.numnfv = :3
"""

# Cartas de correção já gravadas para a nota (só o evento 110110; a tabela também tem
# cancelamento e encerramento).
TIPEVE_CARTA_CORRECAO = 110110
QUERY_CARTAS_NF = f"""
    SELECT cce.seqeve, cce.dateve, cce.horeve, cce.sitcce, cce.descor, cce.numprt, cce.dataut, cce.horaut
    FROM E140CCE cce
    WHERE cce.codemp = {SENIOR_CODEMP}
      AND cce.codfil = :1
      AND cce.codsnf = :2
      AND cce.numnfv = :3
      AND cce.tipeve = {TIPEVE_CARTA_CORRECAO}
    ORDER BY cce.seqeve
"""

QUERY_TRANSPORTADORAS = """
    SELECT codtra, nomtra
    FROM (
        SELECT tra.codtra, tra.nomtra
        FROM E073TRA tra
        WHERE UPPER(tra.nomtra) LIKE :1
           OR TO_CHAR(tra.codtra) LIKE :2
        ORDER BY tra.nomtra
    )
    WHERE ROWNUM <= 40
"""

QUERY_TRANSPORTADORA = """
    SELECT codtra, nomtra FROM E073TRA WHERE codtra = :1
"""


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _hora(minutos) -> str:
    """Hora no padrão Senior (minutos desde a meia-noite) → 'HH:MM'."""
    m = _int(minutos)
    if m is None:
        return ''
    return f'{m // 60:02d}:{m % 60:02d}'


def _data(v) -> str:
    if hasattr(v, 'strftime'):
        return '' if v.year <= 1900 else v.strftime('%d/%m/%Y')   # 31/12/1900 = vazio no Senior
    return str(v) if v else ''


def situacao_nf(codfil, codsnf, numnfv) -> dict:
    """{'disponivel', 'sitnfv', 'sitdoe', 'sitdoe_label', 'autorizada', 'codtra', 'nomtra', 'ciffob', 'qtdemb', 'erro'}"""
    try:
        rows = fetch(QUERY_SITUACAO_NF, [codfil, codsnf, int(numnfv)])
    except Exception as e:  # ORA-00904 (coluna), ORA-00942 (tabela), rede...
        logger.warning('carta_correcao: situação da NF indisponível: %s', e)
        return {'disponivel': False, 'erro': str(e).splitlines()[0][:300], 'autorizada': None}
    if not rows:
        return {'disponivel': True, 'encontrada': False, 'autorizada': False,
                'erro': 'NF não encontrada no Senior (empresa %s, filial %s, série %s, número %s)'
                        % (SENIOR_CODEMP, codfil, codsnf, numnfv)}
    r = rows[0]
    sitdoe = _int(r.get('sitdoe'))
    return {
        'disponivel': True,
        'encontrada': True,
        'sitnfv': _int(r.get('sitnfv')),
        'sitdoe': sitdoe,
        'sitdoe_label': SITDOE_LABELS.get(sitdoe, str(sitdoe) if sitdoe is not None else 'sem registro eletrônico'),
        'autorizada': sitdoe == 3,
        'chvdoe': (r.get('chvdoe') or '').strip(),
        'protocolo': (r.get('numprt') or '').strip(),
        'autorizada_em': f"{_data(r.get('dataut'))} {_hora(r.get('horaut'))}".strip(),
        'codtra': str(r.get('codtra') or '').strip(),
        'nomtra': (r.get('nomtra') or '').strip(),
        'ciffob': (r.get('ciffob') or '').strip(),
        'qtdemb': _int(r.get('qtdemb')),     # quantidade de volumes da NF (o `qtdEmb` do Gravar)
        'erro': '',
    }


def _mapear_carta(row: dict) -> dict:
    sitcce = _int(row.get('sitcce'))
    return {
        'sequencia': _int(row.get('seqeve')),
        'texto': str(row.get('descor') or '').strip(),
        'sitcce': sitcce,
        'sitcce_label': SITCCE_LABELS.get(sitcce, str(sitcce) if sitcce is not None else ''),
        'data': _data(row.get('dateve')),
        'hora': _hora(row.get('horeve')),
        'protocolo': str(row.get('numprt') or '').strip(),
        'autorizada_em': f"{_data(row.get('dataut'))} {_hora(row.get('horaut'))}".strip(),
    }


def cartas_anteriores(codfil, codsnf, numnfv) -> dict:
    """{'disponivel', 'cartas': [...ordenadas da mais antiga à mais nova], 'erro'}"""
    try:
        rows = fetch(QUERY_CARTAS_NF, [codfil, codsnf, int(numnfv)])
    except Exception as e:
        logger.warning('carta_correcao: cartas anteriores indisponíveis: %s', e)
        return {'disponivel': False, 'cartas': [], 'erro': str(e).splitlines()[0][:300]}
    cartas = [_mapear_carta(r) for r in rows]
    # A palavra final é do eDocs (2026-11-23): a E140CCE pode ficar 'Não enviada' com a carta
    # já autorizada na SEFAZ (o retorno do SDE não é gravado no ERP desde 19/11/2026).
    edocs = eventos_edocs(chave_nf(codfil, codsnf, numnfv))
    cartas = _fundir_com_edocs(cartas, edocs['eventos'])
    cartas, ecos = _separar_ecos(cartas)
    return {'disponivel': True, 'cartas': cartas, 'ecos_com_erro': ecos, 'erro': '',
            'edocs_disponivel': edocs['disponivel'], 'edocs_erro': edocs['erro']}


# ---------------------------------------------------------------------------
# eDocs (SDE) — o banco do serviço que fala com a SEFAZ (2026-11-23)
# N130ENF = evento da NF-e (idevnt = 'ID' + tipo do evento + chave + nº sequencial; codsta =
# cStat da SEFAZ, 135/136 = evento registrado; prtsef/datsef = protocolo e data da autorização);
# N130CCE = texto da carta (dsccor) do evento.
# ---------------------------------------------------------------------------

CSTAT_EVENTO_REGISTRADO = (135, 136)
_RE_SCHEMA = re.compile(r'^[A-Za-z][A-Za-z0-9_$#]{0,29}$')

QUERY_CHAVE_NF = f"""
    SELECT ide.chvdoe FROM E140IDE ide
    WHERE ide.codemp = {SENIOR_CODEMP} AND ide.codfil = :1 AND ide.codsnf = :2 AND ide.numnfv = :3
"""

QUERY_EVENTOS_EDOCS = """
    SELECT e.numevt, e.datevt, e.datsef, e.prtsef, e.codsta, c.dsccor
    FROM {schema}.N130ENF e
    LEFT JOIN {schema}.N130CCE c ON c.seqenf = e.seqenf
    WHERE e.tipevt = 110110
      AND e.idevnt LIKE :1
    ORDER BY e.numevt, e.seqenf
"""


def chave_nf(codfil, codsnf, numnfv) -> str:
    try:
        rows = fetch(QUERY_CHAVE_NF, [codfil, codsnf, int(numnfv)])
    except Exception as e:
        logger.warning('carta_correcao: chave da NF indisponível: %s', e)
        return ''
    return str(rows[0].get('chvdoe') or '').strip() if rows else ''


def eventos_edocs(chvdoe: str) -> dict:
    """Cartas de correção da nota no eDocs: {'disponivel', 'eventos': [{sequencia, texto, cstat,
    autorizada, protocolo, autorizada_em}], 'erro'}. Qualquer falha (esquema sem acesso, chave
    desconhecida) → disponivel False e lista vazia; quem chama segue só com a E140CCE."""
    schema = (getattr(settings, 'SENIOR_EDOCS_SCHEMA', '') or '').strip()
    chvdoe = ''.join(ch for ch in str(chvdoe or '') if ch.isdigit())
    if not schema or not _RE_SCHEMA.match(schema) or len(chvdoe) != 44:
        return {'disponivel': False, 'eventos': [], 'erro': 'eDocs não configurado ou nota sem chave'}
    try:
        rows = fetch(QUERY_EVENTOS_EDOCS.format(schema=schema), [f'ID110110{chvdoe}%'])
    except Exception as e:
        logger.warning('carta_correcao: eDocs indisponível: %s', e)
        return {'disponivel': False, 'eventos': [], 'erro': str(e).splitlines()[0][:300]}
    eventos = []
    for r in rows:
        cstat = _int(r.get('codsta'))
        prot = str(_int(r.get('prtsef')) or '').strip()
        quando = r.get('datsef')
        eventos.append({
            'sequencia': _int(r.get('numevt')),
            'texto': str(r.get('dsccor') or '').strip(),
            'cstat': cstat,
            'autorizada': cstat in CSTAT_EVENTO_REGISTRADO and bool(prot),
            'protocolo': prot,
            'autorizada_em': quando.strftime('%d/%m/%Y %H:%M') if hasattr(quando, 'strftime') else '',
        })
    return {'disponivel': True, 'eventos': eventos, 'erro': ''}


def _norm(t) -> str:
    return ' '.join((t or '').upper().split())


def _fundir_com_edocs(cartas: list[dict], eventos: list[dict]) -> list[dict]:
    """Aplica o que o eDocs sabe às linhas da E140CCE. Para cada evento AUTORIZADO no eDocs:
    a linha do ERP com o mesmo texto vira Autorizada (protocolo e data do eDocs, `fonte` edocs);
    sem linha no ERP (foi apagada lá — apagar não desfaz o evento na SEFAZ), entra uma linha só
    do eDocs. O que o eDocs não conhece (carta só gravada, nunca transmitida) fica como está."""
    cartas = [dict(c) for c in cartas]
    usados = set()
    for ev in eventos:
        if not ev['autorizada']:
            continue
        # 1º a linha do ERP que já tem este protocolo (o texto dela pode ter sido editado lá —
        # NF 152139); depois, pelo texto: a que não está em erro, senão qualquer uma
        livres = [i for i in range(len(cartas)) if i not in usados]
        alvo = next((i for i in livres if cartas[i]['protocolo'] == ev['protocolo']), None)
        if alvo is None:
            candidatas = [i for i in livres if _norm(cartas[i]['texto']) == _norm(ev['texto'])]
            alvo = next((i for i in candidatas if cartas[i]['sitcce'] != SITCCE_ERRO), None)
            if alvo is None and candidatas:
                alvo = candidatas[0]
        if alvo is None:
            cartas.append({
                'sequencia': ev['sequencia'], 'texto': ev['texto'], 'sitcce': 3, 'sitcce_label': SITCCE_LABELS[3],
                'data': ev['autorizada_em'][:10], 'hora': ev['autorizada_em'][11:],
                'protocolo': ev['protocolo'], 'autorizada_em': ev['autorizada_em'],
                'fonte': 'edocs', 'so_no_edocs': True, 'sequencia_sefaz': ev['sequencia'],
            })
            usados.add(len(cartas) - 1)
            continue
        usados.add(alvo)
        c = cartas[alvo]
        # O texto que vale é o que a SEFAZ registrou. A linha do ERP pode ter sido regravada
        # depois com outro texto e o mesmo protocolo (NF 150297 e 152139, 18–19/11/2026).
        if ev['texto'] and _norm(c['texto']) != _norm(ev['texto']):
            c['texto_erp'] = c['texto']
            c['texto'] = ev['texto']
        if c['sitcce'] != 3 or not c['protocolo']:
            c.update({'sitcce_erp': c['sitcce'], 'sitcce': 3, 'sitcce_label': SITCCE_LABELS[3],
                      'protocolo': ev['protocolo'], 'autorizada_em': ev['autorizada_em'], 'fonte': 'edocs'})
        c['sequencia_sefaz'] = ev['sequencia']
    return cartas


def _separar_ecos(cartas: list[dict]) -> tuple[list[dict], list[dict]]:
    """(cartas de verdade, ecos). Eco = linha com sitcce 10 cujo texto é igual ao de outra linha
    da nota que NÃO está em erro: é a sobra da transmissão, não uma carta a mais — não entra em
    sequência, bloqueio nem no texto das correções anteriores. Linha com erro e texto próprio
    continua na lista (é uma carta que falhou e alguém precisa acertar no Senior)."""
    def norm(t):
        return ' '.join((t or '').upper().split())
    textos_validos = {norm(c['texto']) for c in cartas if c['sitcce'] != SITCCE_ERRO}
    reais, ecos = [], []
    for c in cartas:
        (ecos if c['sitcce'] == SITCCE_ERRO and norm(c['texto']) in textos_validos else reais).append(c)
    return reais, ecos


def transportadoras(q: str) -> list[dict]:
    termo = (q or '').strip().upper()
    like = f'%{termo}%' if termo else '%'
    rows = fetch(QUERY_TRANSPORTADORAS, [like, like])
    return [{'codtra': str(r['codtra']).strip(), 'nome': (r['nomtra'] or '').strip()} for r in rows]


def transportadora(codtra) -> dict | None:
    rows = fetch(QUERY_TRANSPORTADORA, [codtra])
    if not rows:
        return None
    return {'codtra': str(rows[0]['codtra']).strip(), 'nome': (rows[0]['nomtra'] or '').strip()}


# ---------------------------------------------------------------------------
# Escrita (SOAP)
# ---------------------------------------------------------------------------

class ErroSenior(Exception):
    """Falha de transporte/SOAP (não é recusa de negócio — essa vem em tipoRetorno=-1)."""


_clients: dict[str, object] = {}


def _client(wsdl: str):
    if not wsdl:
        raise ErroSenior('WSDL não configurado (SENIOR_WSDL_CARTA_CORRECAO / SENIOR_WSDL_DOCUMENTO_FISCAL)')
    if wsdl not in _clients:
        from requests import Session
        from zeep import Client
        from zeep.transports import Transport
        _clients[wsdl] = Client(wsdl=wsdl, transport=Transport(session=Session(), timeout=30, operation_timeout=60))
    return _clients[wsdl]


def _serializar(resposta) -> dict:
    from zeep.helpers import serialize_object
    dados = serialize_object(resposta)
    return dados if isinstance(dados, dict) else {'result': dados}


def dry_run() -> bool:
    return bool(getattr(settings, 'SENIOR_WS_DRY_RUN', True))


def gravar_carta(carta: dict) -> dict:
    """`cartadecorrecao.Gravar` com UMA carta. Devolve o `result` serializado:
    {'tipoRetorno': 0|-1, 'mensagemRetorno': str, 'erroExecucao': str|None}."""
    client = _client(settings.SENIOR_WSDL_CARTA_CORRECAO)
    try:
        resposta = client.service.Gravar(
            user=settings.SENIOR_WS_USER,
            password=settings.SENIOR_WS_PASSWORD,
            encryption=0,
            parameters={'cartaCorrecao': [carta]},
        )
    except Exception as e:
        raise ErroSenior(f'Gravar: {e}') from e
    return _serializar(resposta)


def transmitir_carta(cabecalho: dict) -> dict:
    """`documentofiscal.EmitirCartaCorrecao` com UM cabeçalho. Devolve o `result` serializado:
    {'tipoRetorno', 'mensagemRetorno', 'erroExecucao', 'retornos': [{tipRet, sitDoe, numPrt, ...}]}."""
    client = _client(settings.SENIOR_WSDL_DOCUMENTO_FISCAL)
    try:
        resposta = client.service.EmitirCartaCorrecao(
            user=settings.SENIOR_WS_USER,
            password=settings.SENIOR_WS_PASSWORD,
            encryption=0,
            parameters={'cabecalho': [cabecalho]},
        )
    except Exception as e:
        raise ErroSenior(f'EmitirCartaCorrecao: {e}') from e
    return _serializar(resposta)
