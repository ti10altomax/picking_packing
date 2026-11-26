"""Desempenho do sistema dia a dia (Admin → Desempenho, 2026-11-26).

Até aqui a medição era feita à mão: baixar o log de requisições do container (que se perde a
cada deploy) e analisar fora do sistema. Este módulo guarda o que a análise precisava:

  - `MedidaRequisicao`: resumo dos tempos de resposta por janela de 5 minutos, ação e perfil —
    quantidade, soma, máximo e um histograma (para estimar mediana e 95%). Uma linha por
    janela/ação/perfil, não por requisição: o custo é uma gravação a cada ~30 s por processo
    do gunicorn (os contadores ficam em memória entre uma gravação e outra — se o processo cai,
    perde-se no máximo esse intervalo);
  - `RequisicaoLenta`: as requisições demoradas, uma a uma (são poucas por dia), com hora,
    caminho e usuário — para dizer "que tela, de quem, a que horas".

A atividade (bips, OPs, conferências concluídas, quem trabalhou) não precisa de tabela nova:
já está no `PedidoLog`, inclusive dos dias anteriores a este módulo. Os tempos só existem a
partir do deploy.

`registrar()` é chamado pelo `LogRequisicaoMiddleware` e nunca pode derrubar uma requisição.
"""
import datetime as dt
import logging
import re
import threading
import time

from django.db import connection
from django.db.models import Count
from django.db.models.functions import ExtractHour
from django.utils import timezone

logger = logging.getLogger(__name__)

JANELA_MIN = 5
INTERVALO_GRAVACAO_S = 30
GUARDAR_DIAS = 120
# Limites superiores (ms) das faixas do histograma; a última faixa é "acima do último limite".
LIMITES_MS = (50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 5000)
N_FAIXAS = len(LIMITES_MS) + 1
# quantas faixas ficam até 0,3 s, até 1 s e até 2 s (para os percentuais do resumo)
ATE_300, ATE_1000, ATE_2000 = (LIMITES_MS.index(x) + 1 for x in (300, 1000, 2000))
# Requisição "lenta" guardada uma a uma: o conferente sente a partir de 1 s; o resto, de 2 s.
LENTA_CONFERENTE_MS = 1000
LENTA_MS = 2000

# (método ou None, regex do caminho, ação). A primeira que casa vale.
_N = r'\d+'
_REGRAS = [
    ('POST', rf'^/api/conferencia/pedidos/{_N}/bipar/$', 'bipar'),
    ('POST', rf'^/api/conferencia/pedidos/{_N}/fardo/$', 'op'),
    ('GET', rf'^/api/conferencia/pedidos/{_N}/$', 'conferencia_tela'),
    ('GET', r'^/api/conferencia/pedidos/$', 'conferente_lista'),
    ('POST', r'^/api/conferencia/pegar/$', 'pegar'),
    ('POST', rf'^/api/conferencia/pedidos/{_N}/iniciar/$', 'iniciar'),
    ('POST', rf'^/api/conferencia/pedidos/{_N}/concluir/$', 'concluir'),
    (None, rf'^/api/conferencia/pedidos/{_N}/volumes/', 'volumes'),
    ('POST', rf'^/api/impressao/pedidos/{_N}/imprimir/$', 'imprimir'),
    (None, r'^/api/etiquetas/agents/', 'agente'),
    ('GET', r'^/api/agora/$', 'agora'),
    ('GET', r'^/api/pedidos/$', 'pedidos_lista'),
    (None, r'^/api/sequencias/', 'sequencias'),
    ('POST', rf'^/api/carta-correcao/pedidos/{_N}/(reenviar/)?$', 'carta_correcao'),
    (None, r'^/api/carta-correcao/', 'cartas_consulta'),
    ('GET', r'^/api/impressao/pendentes/$', 'etiquetas_pendentes'),
    ('POST', r'^/api/pedidos/buscar_lote/$', 'colar_lista'),
    ('GET', r'^/api/saude/$', 'saude'),
    (None, r'^/api/auth/', 'login'),
    (None, r'^/api/(nao-conformes|fechamentos|cancelados|conferidos)/', 'gestao_listas'),
]
_REGRAS = [(m, re.compile(r), a) for m, r, a in _REGRAS]

ROTULOS = {
    'bipar': 'Bip de item',
    'op': 'Leitura de OP (caixa ou fardo fechado)',
    'conferencia_tela': 'Tela da conferência (atualização a cada 15 s)',
    'conferente_lista': 'Lista "Atribuídos a mim"',
    'pegar': 'Pegar a nota bipando',
    'iniciar': 'Iniciar a conferência',
    'concluir': 'Concluir a conferência',
    'volumes': 'Abrir, apagar volume ou tirar item',
    'imprimir': 'Mandar imprimir etiqueta',
    'agente': 'Agente de impressão USB (consulta da fila)',
    'agora': 'Gestão → Agora',
    'pedidos_lista': 'Listas de documentos (Vendas, Pátio, Conferidos, Embarcados)',
    'sequencias': 'Sequências do Pátio',
    'carta_correcao': 'Carta de correção (transmitir e gravar)',
    'cartas_consulta': 'Cartas de correção (consultas)',
    'etiquetas_pendentes': 'Etiquetas de volume (pendentes)',
    'colar_lista': 'Colar lista',
    'saude': 'Admin → Saúde',
    'login': 'Login e renovação de sessão',
    'gestao_listas': 'Não conformes, Fechamentos, Cancelados',
    'outros': 'Outras chamadas',
}
ACOES_CONFERENTE = ('bipar', 'op', 'conferencia_tela', 'conferente_lista', 'pegar', 'iniciar', 'concluir',
                    'volumes', 'imprimir')


def classificar(metodo: str, caminho: str) -> str:
    for m, regex, acao in _REGRAS:
        if (m is None or m == metodo) and regex.search(caminho):
            return acao
    return 'outros'


def _faixa(ms: int) -> int:
    for i, limite in enumerate(LIMITES_MS):
        if ms <= limite:
            return i
    return N_FAIXAS - 1


# ---------------------------------------------------------------------------
# Gravação (chamada pelo middleware)
# ---------------------------------------------------------------------------

_trava = threading.Lock()
_acumulado: dict[tuple, list] = {}     # (janela, acao, perfil) → [n, soma, max, erros, f0…]
_ultima_gravacao = time.monotonic()
_ultima_limpeza = 0.0


def _janela(agora: dt.datetime) -> dt.datetime:
    return agora.replace(minute=agora.minute - agora.minute % JANELA_MIN, second=0, microsecond=0)


def registrar(metodo: str, caminho: str, status: int, ms: int, usuario: str | None, perfil: str | None) -> None:
    """Soma a requisição nos contadores em memória e, de tempos em tempos, grava no banco."""
    global _ultima_gravacao
    try:
        acao = classificar(metodo, caminho)
        agora = timezone.now()
        chave = (_janela(agora), acao, perfil or '')
        pendentes = None
        with _trava:
            c = _acumulado.get(chave)
            if c is None:
                c = _acumulado[chave] = [0, 0, 0, 0] + [0] * N_FAIXAS
            c[0] += 1
            c[1] += ms
            c[2] = max(c[2], ms)
            c[3] += 1 if status >= 500 else 0
            c[4 + _faixa(ms)] += 1
            if time.monotonic() - _ultima_gravacao >= INTERVALO_GRAVACAO_S:
                pendentes = dict(_acumulado)
                _acumulado.clear()
                _ultima_gravacao = time.monotonic()
        if ms > (LENTA_CONFERENTE_MS if perfil == 'conferente' else LENTA_MS):
            from .models import RequisicaoLenta
            RequisicaoLenta.objects.create(
                quando=agora, metodo=metodo[:8], caminho=caminho[:200], acao=acao, status_http=status,
                duracao_ms=ms, usuario=(usuario or '')[:150], perfil=(perfil or '')[:20])
        if pendentes:
            _gravar(pendentes)
    except Exception:  # medir nunca derruba a requisição
        logger.exception('desempenho: falha ao registrar a requisição')


def descarregar() -> int:
    """Grava agora o que está em memória neste processo (testes e desligamento). Devolve as linhas."""
    global _ultima_gravacao
    with _trava:
        pendentes = dict(_acumulado)
        _acumulado.clear()
        _ultima_gravacao = time.monotonic()
    if pendentes:
        _gravar(pendentes)
    return len(pendentes)


def _gravar(pendentes: dict) -> None:
    """Soma os contadores na linha da janela (os processos do gunicorn gravam na mesma linha)."""
    global _ultima_limpeza
    from .models import MedidaRequisicao
    tabela = MedidaRequisicao._meta.db_table
    faixas = [f'f{i}' for i in range(N_FAIXAS)]
    colunas = ['inicio', 'acao', 'perfil', 'n', 'soma_ms', 'max_ms', 'erros', *faixas]
    somas = ', '.join(f'{c} = {tabela}.{c} + EXCLUDED.{c}' for c in ('n', 'soma_ms', 'erros', *faixas))
    sql = (f"INSERT INTO {tabela} ({', '.join(colunas)}) VALUES ({', '.join(['%s'] * len(colunas))}) "
           f"ON CONFLICT (inicio, acao, perfil) DO UPDATE SET {somas}, "
           f"max_ms = GREATEST({tabela}.max_ms, EXCLUDED.max_ms)")
    linhas = [[janela, acao, perfil, *valores] for (janela, acao, perfil), valores in pendentes.items()]
    with connection.cursor() as cur:
        cur.executemany(sql, linhas)
    # limpeza do que passou do prazo: uma vez por dia por processo
    if time.monotonic() - _ultima_limpeza > 86400 or _ultima_limpeza == 0.0:
        _ultima_limpeza = time.monotonic()
        from .models import RequisicaoLenta
        limite = timezone.now() - dt.timedelta(days=GUARDAR_DIAS)
        MedidaRequisicao.objects.filter(inicio__lt=limite).delete()
        RequisicaoLenta.objects.filter(quando__lt=limite).delete()


# ---------------------------------------------------------------------------
# Leitura (a tela)
# ---------------------------------------------------------------------------

def _percentil(faixas: list[int], q: float) -> int | None:
    """Estimativa pelo histograma: acha a faixa onde cai o percentil e interpola dentro dela."""
    total = sum(faixas)
    if not total:
        return None
    alvo = q * total
    acumulado = 0
    for i, n in enumerate(faixas):
        if n and acumulado + n >= alvo:
            baixo = LIMITES_MS[i - 1] if i > 0 else 0
            alto = LIMITES_MS[i] if i < len(LIMITES_MS) else LIMITES_MS[-1] * 2
            return int(baixo + (alto - baixo) * (alvo - acumulado) / n)
        acumulado += n
    return LIMITES_MS[-1]


def _somar(destino: dict, m) -> None:
    destino['n'] += m.n
    destino['soma'] += m.soma_ms
    destino['max'] = max(destino['max'], m.max_ms)
    destino['erros'] += m.erros
    for i in range(N_FAIXAS):
        destino['f'][i] += getattr(m, f'f{i}')


def _novo() -> dict:
    return {'n': 0, 'soma': 0, 'max': 0, 'erros': 0, 'f': [0] * N_FAIXAS}


def _linha(acao: str, d: dict) -> dict:
    ate_300 = sum(d['f'][:ATE_300])
    ate_1000 = sum(d['f'][:ATE_1000])
    return {
        'acao': acao, 'rotulo': ROTULOS.get(acao, acao), 'n': d['n'],
        'mediana_ms': _percentil(d['f'], 0.5), 'p95_ms': _percentil(d['f'], 0.95), 'max_ms': d['max'],
        'media_ms': round(d['soma'] / d['n']) if d['n'] else None,
        'soma_min': round(d['soma'] / 60000, 1),
        'ate_300': ate_300, 'ate_1000': ate_1000, 'acima_2000': sum(d['f'][ATE_2000:]), 'erros': d['erros'],
    }


def relatorio(dia: dt.date) -> dict:
    """Tudo o que a tela Admin → Desempenho mostra para um dia (horário local)."""
    from apps.pedidos.models import PedidoLog
    from .models import MedidaRequisicao, RequisicaoLenta

    tz = timezone.get_current_timezone()
    inicio = timezone.make_aware(dt.datetime.combine(dia, dt.time.min), tz)
    fim = inicio + dt.timedelta(days=1)

    # ---- tempos (só existem depois do deploy deste módulo)
    por_acao: dict[str, dict] = {}
    por_acao_conferente: dict[str, dict] = {}
    bip_por_hora: dict[int, dict] = {}
    geral = _novo()
    sem_agente = _novo()
    for m in MedidaRequisicao.objects.filter(inicio__gte=inicio, inicio__lt=fim):
        _somar(geral, m)
        if m.acao != 'agente':
            _somar(sem_agente, m)
        _somar(por_acao.setdefault(m.acao, _novo()), m)
        if m.perfil == 'conferente' and m.acao in ACOES_CONFERENTE:
            _somar(por_acao_conferente.setdefault(m.acao, _novo()), m)
            if m.acao == 'bipar':
                _somar(bip_por_hora.setdefault(timezone.localtime(m.inicio).hour, _novo()), m)

    acoes_conferente = [_linha(a, por_acao_conferente[a]) for a in ACOES_CONFERENTE if a in por_acao_conferente]
    demais = sorted((_linha(a, d) for a, d in por_acao.items() if a not in ACOES_CONFERENTE),
                    key=lambda x: -x['soma_min'])

    # ---- atividade (PedidoLog — vale para qualquer dia)
    logs = PedidoLog.objects.filter(criado_em__gte=inicio, criado_em__lt=fim)

    def por_hora(acao):
        return {r['h']: r['n'] for r in logs.filter(acao=acao).annotate(h=ExtractHour('criado_em', tzinfo=tz))
                .values('h').annotate(n=Count('id'))}

    def por_usuario(acao):
        return {r['usuario__username'] or '—': r['n'] for r in logs.filter(acao=acao)
                .values('usuario__username').annotate(n=Count('id'))}

    bips_h, concl_h, ops_h = por_hora('item_bipado'), por_hora('conferencia_concluida'), por_hora('fardo_op_lido')
    bipando_h = {r['h']: r['n'] for r in logs.filter(acao='item_bipado').annotate(h=ExtractHour('criado_em', tzinfo=tz))
                 .values('h').annotate(n=Count('usuario', distinct=True))}
    horas = []
    for h in sorted(set(bips_h) | set(concl_h) | set(ops_h) | set(bip_por_hora)):
        tempos = bip_por_hora.get(h)
        horas.append({
            'hora': h, 'bips': bips_h.get(h, 0), 'ops': ops_h.get(h, 0), 'conclusoes': concl_h.get(h, 0),
            'conferentes_bipando': bipando_h.get(h, 0),
            'bip_mediana_ms': _percentil(tempos['f'], 0.5) if tempos else None,
            'bip_p95_ms': _percentil(tempos['f'], 0.95) if tempos else None,
            'bip_max_ms': tempos['max'] if tempos else None,
        })

    bips_u, concl_u, ops_u = por_usuario('item_bipado'), por_usuario('conferencia_concluida'), por_usuario('fardo_op_lido')
    periodo = {}
    for r in (logs.filter(acao__in=('item_bipado', 'fardo_op_lido', 'conferencia_concluida', 'conferencia_iniciada'))
              .values_list('usuario__username', 'criado_em').order_by('criado_em')):
        u = r[0] or '—'
        primeiro, _ = periodo.get(u, (r[1], r[1]))
        periodo[u] = (primeiro, r[1])
    conferentes = sorted((
        {'usuario': u, 'bips': bips_u.get(u, 0), 'ops': ops_u.get(u, 0), 'conclusoes': concl_u.get(u, 0),
         'primeiro': periodo[u][0], 'ultimo': periodo[u][1]}
        for u in periodo), key=lambda x: -(x['bips'] + x['ops'] * 20 + x['conclusoes']))

    lentas = [{
        'quando': r.quando, 'acao': r.acao, 'rotulo': ROTULOS.get(r.acao, r.acao), 'metodo': r.metodo,
        'caminho': r.caminho, 'status_http': r.status_http, 'duracao_ms': r.duracao_ms,
        'usuario': r.usuario or None, 'perfil': r.perfil or None,
    } for r in RequisicaoLenta.objects.filter(quando__gte=inicio, quando__lt=fim).order_by('-duracao_ms')[:200]]

    return {
        'data': dia.isoformat(),
        'tem_tempos': geral['n'] > 0,
        'resumo': {
            'bips': sum(bips_h.values()), 'ops': sum(ops_h.values()), 'conclusoes': sum(concl_h.values()),
            'conferentes': len(conferentes),
            'requisicoes': geral['n'], 'erros': geral['erros'],
            'ate_300_pct': round(100 * sum(geral['f'][:ATE_300]) / geral['n'], 1) if geral['n'] else None,
            'ate_1000_pct': round(100 * sum(geral['f'][:ATE_1000]) / geral['n'], 1) if geral['n'] else None,
            'requisicoes_sem_agente': sem_agente['n'],
            'ate_300_pct_sem_agente': round(100 * sum(sem_agente['f'][:ATE_300]) / sem_agente['n'], 1) if sem_agente['n'] else None,
            'acima_2000': sum(geral['f'][ATE_2000:]),
            'bip_mediana_ms': next((a['mediana_ms'] for a in acoes_conferente if a['acao'] == 'bipar'), None),
            'bip_p95_ms': next((a['p95_ms'] for a in acoes_conferente if a['acao'] == 'bipar'), None),
        },
        'horas': horas,
        'acoes_conferente': acoes_conferente,
        'demais': demais,
        'conferentes': conferentes,
        'lentas': lentas,
        'limites_ms': {'lenta_conferente': LENTA_CONFERENTE_MS, 'lenta': LENTA_MS},
    }
