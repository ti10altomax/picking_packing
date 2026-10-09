"""Formatação dos logs do Separa (2026-10-08, observabilidade — bloco 1).

Em produção tudo sai em JSON, uma linha por evento, no stdout do container —
`docker logs` continua legível e um coletor (Loki/Promtail) consegue indexar
por campo sem regex. Em dev (`DJANGO_DEBUG=True`) o default é texto.

Qualquer `logger.info('msg', extra={'pedido': 123})` vira campo de primeiro
nível no JSON; o formatador descobre os extras comparando com os atributos
padrão do LogRecord.
"""
import datetime as dt
import json
import logging

# Atributos que todo LogRecord tem — o que sobrar é `extra=` do chamador.
_PADRAO = set(vars(logging.LogRecord('', 0, '', 0, '', (), None))) | {
    'message', 'asctime', 'taskName',
}


class FormatadorJson(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        quando = dt.datetime.fromtimestamp(record.created, dt.timezone.utc)
        dados = {
            't': quando.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'nivel': record.levelname,
            'logger': record.name,
            'msg': record.getMessage(),
        }
        for chave, valor in record.__dict__.items():
            if chave not in _PADRAO and not chave.startswith('_'):
                dados[chave] = valor
        if record.exc_info:
            dados['exc'] = self.formatException(record.exc_info)
        return json.dumps(dados, ensure_ascii=False, default=str)


def montar_logging(nivel: str, formato: str) -> dict:
    """Dict pro `LOGGING` do settings. `formato` = 'json' | 'texto'."""
    return {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'json': {'()': 'config.logging.FormatadorJson'},
            'texto': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'},
        },
        'handlers': {
            'console': {'class': 'logging.StreamHandler', 'formatter': formato},
        },
        'root': {'handlers': ['console'], 'level': nivel},
        'loggers': {
            # Sem handlers próprios: tudo sobe pro root e sai no mesmo formato.
            # (o default do Django põe um console só em DEBUG + mail_admins)
            'django': {'handlers': [], 'level': 'INFO', 'propagate': True},
            'django.request': {'handlers': [], 'level': 'WARNING', 'propagate': True},
            'django.db.backends': {'level': 'WARNING'},
            'apps': {'level': nivel},
            'celery': {'level': 'INFO'},
            'oracledb': {'level': 'WARNING'},
        },
    }
