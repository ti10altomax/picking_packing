"""Log de uma linha por requisição da API (observabilidade, 2026-10-08).

Sai pelo logger `apps.core.requisicao` com os campos como `extra=` — em
produção viram chaves do JSON (ver config/logging.py):

    {"t": "...", "nivel": "INFO", "logger": "apps.core.requisicao",
     "msg": "POST /api/conferencia/pedidos/22395/bipar/ 200 38ms",
     "metodo": "POST", "caminho": "/api/conferencia/...", "status_http": 200,
     "duracao_ms": 38, "usuario": "maria", "perfil": "conferente"}

Nível: INFO para 2xx/3xx, WARNING para 4xx, ERROR para 5xx (o traceback do
5xx já sai pelo `django.request`; aqui é só a linha de acesso). Health do
Docker (`/api/health/`) não é logado para não encher o log a cada 30 s.
"""
import logging
import time

logger = logging.getLogger('apps.core.requisicao')

_SILENCIOSOS = ('/api/health/', '/metrics/')


class LogRequisicaoMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        inicio = time.perf_counter()
        response = self.get_response(request)
        caminho = request.path
        if caminho in _SILENCIOSOS or not caminho.startswith('/api/'):
            return response

        duracao_ms = int((time.perf_counter() - inicio) * 1000)
        status = response.status_code
        # request.user é resolvido pela autenticação do DRF (JWT), não pela
        # sessão — a view já populou `request._request.user` quando autenticou.
        user = getattr(request, 'user', None)
        usuario = user.username if user is not None and user.is_authenticated else None
        perfil = getattr(user, 'perfil', None) if usuario else None

        nivel = logging.INFO if status < 400 else logging.WARNING if status < 500 else logging.ERROR
        logger.log(
            nivel,
            f'{request.method} {caminho} {status} {duracao_ms}ms',
            extra={
                'metodo': request.method,
                'caminho': caminho,
                'status_http': status,
                'duracao_ms': duracao_ms,
                'usuario': usuario,
                'perfil': perfil,
                'ip': request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')).split(',')[0].strip(),
            },
        )
        return response
