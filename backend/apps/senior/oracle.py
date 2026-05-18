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

# Busca pedidos abertos (sitPed=1) para importar como Pendente
# JOIN com E085CLI (clientes) para trazer o nome
QUERY_PEDIDOS_PENDENTES = f"""
    SELECT
        ped.numped,
        ped.codcli,
        ped.datemi,
        cli.nomcli
    FROM E120PED ped
    LEFT JOIN E085CLI cli
        ON cli.codcli = ped.codcli
    WHERE ped.codemp = {SENIOR_CODEMP}
      AND ped.sitped = 1
    ORDER BY ped.datemi DESC
"""

# Itens do pedido — JOIN com E075DER (codbar por derivação) e E075PRO (despro)
# CODEMP=1 filtrado em todas as tabelas para evitar contaminação multi-empresa
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
"""

# CONGELADO — escopo antigo (Senior faturava após embalagempfa)
# Verifica situação atual de pedidos específicos no Senior (detectar faturamento)
QUERY_SITPED_POR_NUMEROS = f"""
    SELECT NUMPED, SITPED
    FROM E120PED
    WHERE CODEMP = {SENIOR_CODEMP}
      AND NUMPED IN ({{placeholders}})
"""
