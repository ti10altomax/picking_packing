import os
import glob
import threading
import oracledb
from django.conf import settings

_pool = None
_pool_lock = threading.Lock()
_client_initialized = False
_client_lock = threading.Lock()


def _find_instantclient_dir():
    """Resolve o diretório do Instant Client: settings → ORACLE_HOME → glob."""
    configured = getattr(settings, 'ORACLE_CLIENT_LIB', '')
    if configured:
        return configured
    oracle_home = os.environ.get('ORACLE_HOME', '')
    if oracle_home and os.path.isdir(oracle_home):
        return oracle_home
    candidates = glob.glob('/opt/oracle/instantclient_*')
    return candidates[0] if candidates else None


def _init_client():
    global _client_initialized
    if _client_initialized:
        return
    with _client_lock:
        if _client_initialized:
            return
        lib_dir = _find_instantclient_dir() or None
        try:
            oracledb.init_oracle_client(lib_dir=lib_dir)
        except Exception:
            pass  # já inicializado ou lib não disponível — usa thin mode
        _client_initialized = True


def get_pool():
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is not None:
            return _pool
        _init_client()
        _pool = oracledb.create_pool(
            user=settings.ORACLE_USER,
            password=settings.ORACLE_PASSWORD,
            dsn=f"{settings.ORACLE_HOST}:{settings.ORACLE_PORT}/{settings.ORACLE_DB}",
            min=1,
            max=5,
            increment=1,
        )
    return _pool


def fetch(query, params=None):
    pool = get_pool()
    with pool.acquire() as conn:
        conn.current_schema = settings.ORACLE_SCHEMA
        with conn.cursor() as cursor:
            cursor.execute(query, params or [])
            columns = [col[0].lower() for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]


def execute(query, params=None):
    raise NotImplementedError("Oracle do Senior é read-only. Use o SOAP para gravar.")


# Empresa alvo dos pedidos no Senior (escopo atual: separação interna Altomax)
SENIOR_CODEMP = 1

# Busca pedidos abertos (sitPed=1) para importar como Pendente.
# JOIN com E085CLI (clientes) para trazer o nome. Numeração é por filial → codfil
# entra na identidade local. CIFFOB: C = entrega (frete), F = retira (cliente busca), X = sem frete.
# :1 = janela em dias (Configuracao 'janela_sync_dias'); TRUNC pega o dia inteiro.
QUERY_PEDIDOS_PENDENTES = f"""
    SELECT
        ped.codfil,
        ped.numped,
        ped.codcli,
        ped.datemi,
        ped.ciffob,
        cli.nomcli
    FROM E120PED ped
    LEFT JOIN E085CLI cli
        ON cli.codcli = ped.codcli
    WHERE ped.codemp = {SENIOR_CODEMP}
      AND ped.sitped = 1
      AND ped.datemi >= TRUNC(SYSDATE) - :1
    ORDER BY ped.datemi DESC
"""

# Itens do pedido — JOIN com E075DER (codbar por derivação) e E075PRO (despro)
# CODEMP=1 filtrado em todas as tabelas para evitar contaminação multi-empresa
# :1 = numped · :2 = codfil
QUERY_ITENS_PEDIDO = f"""
    SELECT
        ipd.numped,
        ipd.codpro,
        ipd.codder,
        ipd.qtdabe,
        der.codbar,
        pro.despro
    FROM E120IPD ipd
    LEFT JOIN E075DER der
        ON der.codemp = {SENIOR_CODEMP}
       AND der.codpro = ipd.codpro
       AND der.codder = ipd.codder
    LEFT JOIN E075PRO pro
        ON pro.codemp = {SENIOR_CODEMP}
       AND pro.codpro = ipd.codpro
    WHERE ipd.codemp = {SENIOR_CODEMP}
      AND ipd.numped = :1
      AND ipd.codfil = :2
"""

# CONGELADO — escopo antigo (Senior faturava após embalagempfa)
# Verifica situação atual de pedidos específicos no Senior (detectar faturamento)
QUERY_SITPED_POR_NUMEROS = f"""
    SELECT NUMPED, SITPED
    FROM E120PED
    WHERE CODEMP = {SENIOR_CODEMP}
      AND NUMPED IN ({{placeholders}})
"""

# Notas fiscais de venda fechadas (sitNfv=2) SEM pedido de origem — as que vieram
# de pedido já passaram (ou vão passar) pela conferência como pedido. A origem é
# detectada pelos itens (E140IPV.numped). Numeração é por filial + série → ambos
# entram na identidade local. :1 = janela em dias.
QUERY_NF_PENDENTES = f"""
    SELECT
        nfv.codfil,
        nfv.codsnf,
        nfv.numnfv,
        nfv.codcli,
        nfv.datemi,
        nfv.ciffob,
        cli.nomcli
    FROM E140NFV nfv
    LEFT JOIN E085CLI cli
        ON cli.codcli = nfv.codcli
    WHERE nfv.codemp = {SENIOR_CODEMP}
      AND nfv.sitnfv = 2
      AND nfv.datemi >= TRUNC(SYSDATE) - :1
      AND NOT EXISTS (
          SELECT 1
          FROM E140IPV ipv
          WHERE ipv.codemp = nfv.codemp
            AND ipv.codfil = nfv.codfil
            AND ipv.codsnf = nfv.codsnf
            AND ipv.numnfv = nfv.numnfv
            AND NVL(ipv.numped, 0) > 0
      )
    ORDER BY nfv.datemi DESC
"""

# Itens da NF — mesma estrutura dos itens do pedido; a quantidade é qtdfat.
# :1 = numnfv · :2 = codfil · :3 = codsnf
QUERY_ITENS_NF = f"""
    SELECT
        ipv.numnfv,
        ipv.codpro,
        ipv.codder,
        ipv.qtdfat,
        der.codbar,
        pro.despro
    FROM E140IPV ipv
    LEFT JOIN E075DER der
        ON der.codemp = {SENIOR_CODEMP}
       AND der.codpro = ipv.codpro
       AND der.codder = ipv.codder
    LEFT JOIN E075PRO pro
        ON pro.codemp = {SENIOR_CODEMP}
       AND pro.codpro = ipv.codpro
    WHERE ipv.codemp = {SENIOR_CODEMP}
      AND ipv.numnfv = :1
      AND ipv.codfil = :2
      AND ipv.codsnf = :3
"""
