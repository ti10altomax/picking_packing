"""Heartbeat das tarefas Celery (observabilidade, 2026-10-08).

Uso:

    @shared_task
    @registrar_execucao()
    def sincronizar_pedidos_oracle(): ...

    @shared_task(bind=True)
    @registrar_execucao(erro_se=lambda r: 'falha_oracle' in str(r))
    def outra(self, ...): ...

Cada chamada vira uma linha em `ExecucaoTarefa` (rodando → ok | erro). A
exceção é re-levantada depois de registrada, então retry/autoretry do Celery
continuam funcionando. `erro_se(resultado)` deixa marcar como erro uma
execução que terminou "normal" mas devolveu falha (o sync não levanta quando
o Oracle cai — devolve `{'erro': 'falha_oracle'}`).

`TAREFAS_PERIODICAS` vem do `CELERY_BEAT_SCHEDULE` do settings — o intervalo
esperado é o que diz se a última execução está atrasada.
"""
import functools
import logging
import socket
import datetime as dt

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

RETENCAO_DIAS = 7
# Quantos intervalos do beat sem execução OK até o /api/saude/ marcar "atrasada"
FATOR_ATRASO = 3


def tarefas_periodicas() -> dict[str, float]:
    """{nome_da_task: intervalo_em_segundos} a partir do beat schedule do settings."""
    saida = {}
    for item in settings.CELERY_BEAT_SCHEDULE.values():
        agenda = item.get('schedule')
        segundos = agenda if isinstance(agenda, (int, float)) else getattr(agenda, 'seconds', None)
        if isinstance(agenda, dt.timedelta):
            segundos = agenda.total_seconds()
        if segundos:
            saida[item['task']] = float(segundos)
    return saida


def _limpar_antigas():
    from .models import ExecucaoTarefa
    limite = timezone.now() - dt.timedelta(days=RETENCAO_DIAS)
    ExecucaoTarefa.objects.filter(iniciada_em__lt=limite).delete()


def _serializavel(valor):
    """Resultado da task como JSON — dict/list passam; o resto vira string."""
    if valor is None or isinstance(valor, (dict, list, str, int, float, bool)):
        return valor
    return str(valor)


def registrar_execucao(erro_se=None):
    def decorador(fn):
        nome = f'{fn.__module__}.{fn.__name__}'

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            from .models import ExecucaoTarefa

            inicio = timezone.now()
            try:
                _limpar_antigas()
                reg = ExecucaoTarefa.objects.create(
                    tarefa=nome, iniciada_em=inicio, worker=socket.gethostname()[:100],
                )
            except Exception:
                # Nunca derrubar a tarefa por causa do heartbeat
                logger.exception('registrar_execucao: falha ao abrir registro', extra={'tarefa': nome})
                reg = None

            try:
                resultado = fn(*args, **kwargs)
            except Exception as exc:
                _fechar(reg, inicio, ExecucaoTarefa.Status.ERRO, None, f'{type(exc).__name__}: {exc}')
                raise

            status = ExecucaoTarefa.Status.OK
            erro = ''
            if erro_se is not None:
                try:
                    if erro_se(resultado):
                        status, erro = ExecucaoTarefa.Status.ERRO, 'resultado com falha'
                except Exception:
                    pass
            _fechar(reg, inicio, status, resultado, erro)
            return resultado

        return wrapper
    return decorador


def _fechar(reg, inicio, status, resultado, erro):
    if reg is None:
        return
    fim = timezone.now()
    try:
        reg.status = status
        reg.terminada_em = fim
        reg.duracao_ms = int((fim - inicio).total_seconds() * 1000)
        reg.resultado = _serializavel(resultado)
        reg.erro = erro or ''
        reg.save(update_fields=['status', 'terminada_em', 'duracao_ms', 'resultado', 'erro'])
    except Exception:
        logger.exception('registrar_execucao: falha ao fechar registro', extra={'tarefa': reg.tarefa})
    nivel = logging.INFO if status == 'ok' else logging.ERROR
    logger.log(
        nivel, f'{reg.tarefa.rsplit(".", 1)[-1]}: {status} em {reg.duracao_ms} ms',
        extra={'tarefa': reg.tarefa, 'duracao_ms': reg.duracao_ms, 'status_tarefa': status, 'erro': erro or None},
    )


def resumo_tarefas() -> list[dict]:
    """Última execução de cada tarefa conhecida — base do /api/saude/.

    Tarefas periódicas (beat) ganham `intervalo_s` e `atrasada`; as sob demanda
    (ex.: impressão de etiqueta) aparecem só com a última execução.
    """
    from .models import ExecucaoTarefa

    agora = timezone.now()
    periodicas = tarefas_periodicas()
    nomes = set(periodicas) | set(
        ExecucaoTarefa.objects.filter(iniciada_em__gte=agora - dt.timedelta(days=1))
        .values_list('tarefa', flat=True).distinct()
    )

    saida = []
    for nome in sorted(nomes):
        ultima = ExecucaoTarefa.objects.filter(tarefa=nome).first()
        ultima_ok = ExecucaoTarefa.objects.filter(tarefa=nome, status=ExecucaoTarefa.Status.OK).first()
        intervalo = periodicas.get(nome)
        idade_ok = (agora - ultima_ok.iniciada_em).total_seconds() if ultima_ok else None
        atrasada = bool(intervalo) and (idade_ok is None or idade_ok > intervalo * FATOR_ATRASO)
        desde_1d = ExecucaoTarefa.objects.filter(tarefa=nome, iniciada_em__gte=agora - dt.timedelta(days=1))
        saida.append({
            'tarefa': nome,
            'nome': nome.rsplit('.', 1)[-1],
            'periodica': intervalo is not None,
            'intervalo_s': intervalo,
            'atrasada': atrasada,
            'ultima_em': ultima.iniciada_em if ultima else None,
            'ultimo_status': ultima.status if ultima else None,
            'duracao_ms': ultima.duracao_ms if ultima else None,
            'erro': (ultima.erro or '')[:300] if ultima else '',
            'resultado': ultima.resultado if ultima else None,
            'ultima_ok_em': ultima_ok.iniciada_em if ultima_ok else None,
            'idade_ok_s': int(idade_ok) if idade_ok is not None else None,
            'execucoes_24h': desde_1d.count(),
            'erros_24h': desde_1d.filter(status=ExecucaoTarefa.Status.ERRO).count(),
        })
    return saida
