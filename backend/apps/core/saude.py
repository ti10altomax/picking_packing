"""Checagens de saúde do sistema (observabilidade, 2026-10-08).

Dois níveis:

- `vivo()` — Postgres + Redis. É o que o healthcheck do Docker bate a cada 30 s
  (`/api/health/`, sem autenticação). Barato e rápido.
- `completo()` — tudo: Postgres, Redis, worker Celery, Oracle do Senior,
  agentes USB, mais o heartbeat das tarefas periódicas (`apps.core.tarefas`).
  Alimenta `/api/saude/` e a tela Admin → Saúde.

Cada componente devolve status `ok` | `atencao` | `erro` + detalhe + latência.
O status geral é o pior entre os componentes essenciais (Postgres, Redis,
worker) e as tarefas atrasadas; Oracle fora e agente parado são `atencao`
porque o galpão continua conferindo — só não entram documentos novos.
"""
import concurrent.futures
import datetime as dt
import logging
import time

from django.conf import settings
from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

OK, ATENCAO, ERRO = 'ok', 'atencao', 'erro'
_PESO = {OK: 0, ATENCAO: 1, ERRO: 2}
TIMEOUT_ORACLE_S = 5
AGENTE_PARADO_APOS_S = 180


def _medir(fn):
    """Executa fn() devolvendo (status, detalhe, latencia_ms)."""
    inicio = time.perf_counter()
    try:
        status, detalhe = fn()
    except Exception as exc:
        status, detalhe = ERRO, f'{type(exc).__name__}: {exc}'[:300]
    return status, detalhe, int((time.perf_counter() - inicio) * 1000)


def _postgres():
    with connection.cursor() as cur:
        cur.execute('SELECT 1')
        cur.fetchone()
    return OK, 'conectado'


def _redis():
    import redis
    cli = redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_timeout=2, socket_connect_timeout=2)
    cli.ping()
    try:
        info = cli.info('memory')
        usado = info.get('used_memory_human', '?')
        maximo = info.get('maxmemory_human') or '0B'
        limite = 'sem limite' if maximo in ('0', '0B') else f'de {maximo}'
        return OK, f'memória {usado} {limite}'
    except Exception:
        return OK, 'conectado'


def _worker():
    from config.celery import app
    # limit=1: volta no primeiro pong em vez de esperar o timeout inteiro
    respostas = app.control.ping(timeout=2.0, limit=1)
    if not respostas:
        return ERRO, 'nenhum worker respondeu ao ping em 2 s'
    nomes = sorted(k for r in respostas for k in r)
    return OK, 'respondeu: ' + ', '.join(nomes)


def _oracle():
    from apps.senior.oracle import fetch
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
        futuro = ex.submit(fetch, 'SELECT 1 AS um FROM DUAL')
        try:
            futuro.result(timeout=TIMEOUT_ORACLE_S)
        except concurrent.futures.TimeoutError:
            return ERRO, f'sem resposta em {TIMEOUT_ORACLE_S} s'
    return OK, f'{settings.ORACLE_HOST}:{settings.ORACLE_PORT}/{settings.ORACLE_DB}'


def _agentes():
    """Agentes USB (PrintAgent, módulo congelado reaproveitado pela etiqueta)."""
    from apps.pedidos.models import PrintAgent
    agentes = list(PrintAgent.objects.all())
    if not agentes:
        return OK, 'nenhum agente cadastrado'
    agora = timezone.now()
    parados = [
        a.hostname for a in agentes
        if not a.ultimo_heartbeat or (agora - a.ultimo_heartbeat).total_seconds() > AGENTE_PARADO_APOS_S
    ]
    if parados:
        return ATENCAO, f'{len(parados)} de {len(agentes)} sem heartbeat há mais de {AGENTE_PARADO_APOS_S // 60} min: ' + ', '.join(parados)
    return OK, f'{len(agentes)} agente(s) ativos'


def _erros_cliente():
    """Erros no web/coletor nas últimas 24 h (ErroCliente)."""
    from .models import ErroCliente
    desde = timezone.now() - dt.timedelta(hours=24)
    qs = ErroCliente.objects.filter(criado_em__gte=desde)
    total = qs.count()
    if not total:
        return OK, 'nenhum erro nas últimas 24 h'
    web = qs.filter(origem='web').count()
    return ATENCAO, f'{total} nas últimas 24 h ({web} web, {total - web} coletor)'


def _componente(chave, nome, fn, essencial):
    status, detalhe, latencia = _medir(fn)
    return {
        'chave': chave, 'nome': nome, 'status': status,
        'detalhe': detalhe, 'latencia_ms': latencia, 'essencial': essencial,
    }


def vivo() -> dict:
    componentes = [
        _componente('postgres', 'Postgres', _postgres, True),
        _componente('redis', 'Redis', _redis, True),
    ]
    status = max((c['status'] for c in componentes), key=_PESO.get)
    return {'status': status, 'componentes': componentes}


def completo() -> dict:
    from .tarefas import resumo_tarefas

    componentes = [
        _componente('postgres', 'Postgres', _postgres, True),
        _componente('redis', 'Redis (fila do Celery)', _redis, True),
        _componente('worker', 'Worker Celery', _worker, True),
        _componente('oracle', 'Oracle do Senior', _oracle, False),
        _componente('agentes', 'Agentes USB de impressão', _agentes, False),
        _componente('erros_cliente', 'Erros no web e no coletor', _erros_cliente, False),
    ]
    # Oracle fora não para o galpão: rebaixa de erro para atenção
    for c in componentes:
        if not c['essencial'] and c['status'] == ERRO:
            c['status'] = ATENCAO

    try:
        tarefas = resumo_tarefas()
    except Exception as exc:
        logger.exception('saude: falha ao resumir tarefas')
        tarefas = []
        componentes.append({
            'chave': 'tarefas', 'nome': 'Heartbeat das tarefas', 'status': ERRO,
            'detalhe': f'{type(exc).__name__}: {exc}'[:300], 'latencia_ms': 0, 'essencial': True,
        })

    pior = max((c['status'] for c in componentes), key=_PESO.get)
    if any(t['atrasada'] for t in tarefas):
        pior = max(pior, ERRO, key=_PESO.get)
    elif any(t['ultimo_status'] == 'erro' for t in tarefas):
        pior = max(pior, ATENCAO, key=_PESO.get)

    problemas = [c['nome'] for c in componentes if c['status'] != OK]
    problemas += [f"tarefa {t['nome']} atrasada" for t in tarefas if t['atrasada']]
    problemas += [f"tarefa {t['nome']} com erro" for t in tarefas if not t['atrasada'] and t['ultimo_status'] == 'erro']

    return {
        'status': pior,
        'gerado_em': timezone.now(),
        'problemas': problemas,
        'componentes': componentes,
        'tarefas': tarefas,
        'retencao_dias': dt.timedelta(days=7).days,
    }
