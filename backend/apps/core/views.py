from rest_framework import status as http_status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

import datetime as dt
import logging

from django.utils import timezone
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.authentication import JWTAuthentication

from . import saude
from .models import ErroCliente, User

logger = logging.getLogger(__name__)

PERFIS_GESTAO = ('supervisor_patio', 'supervisor_vendas', 'admin')


class SeparaTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['perfil'] = user.perfil
        return token


class SeparaTokenView(TokenObtainPairView):
    serializer_class = SeparaTokenSerializer


@api_view(['GET'])
def listar_conferentes(request):
    qs = User.objects.filter(
        perfil=User.Perfil.CONFERENTE, is_active=True,
    ).order_by('username').values('id', 'username', 'first_name', 'last_name')
    return Response(list(qs))


# ---------------------------------------------------------------------------
# Saúde do sistema (observabilidade, 2026-10-08)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Liveness para o healthcheck do Docker: Postgres + Redis. 200 ok / 503 erro.

    Sem autenticação de propósito (o Docker não tem token). Devolve só o
    status — o detalhe fica no /api/saude/, que exige login.
    """
    resultado = saude.vivo()
    codigo = http_status.HTTP_200_OK if resultado['status'] == saude.OK else http_status.HTTP_503_SERVICE_UNAVAILABLE
    return Response({'status': resultado['status']}, status=codigo)


@api_view(['GET'])
def saude_completa(request):
    """Tela Admin → Saúde: componentes (Postgres, Redis, worker, Oracle, agentes)
    e heartbeat das tarefas periódicas. Supervisores e admin."""
    if request.user.perfil not in PERFIS_GESTAO:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return Response(saude.completo())


# ---------------------------------------------------------------------------
# Erros de cliente — web e coletor (observabilidade, 2026-10-08)
# ---------------------------------------------------------------------------

class ErroClienteThrottle(AnonRateThrottle):
    """Um loop de erro no cliente não pode virar milhares de linhas."""
    scope = 'erros_cliente'
    rate = '60/min'


class _JWTOpcional(JWTAuthentication):
    """Autentica se vier token válido; sem token (tela de login) segue anônimo.
    Token inválido/expirado também vira anônimo — o erro tem que chegar."""
    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except Exception:
            return None


def _texto(valor, limite):
    return str(valor or '')[:limite]


@api_view(['POST'])
@authentication_classes([_JWTOpcional])
@permission_classes([AllowAny])
@throttle_classes([ErroClienteThrottle])
def registrar_erro_cliente(request):
    d = request.data if isinstance(request.data, dict) else {}
    origem = d.get('origem') if d.get('origem') in ('web', 'mobile') else 'web'
    mensagem = _texto(d.get('mensagem'), 500) or '(sem mensagem)'
    usuario = request.user if request.user and request.user.is_authenticated else None
    # retenção de 30 dias
    ErroCliente.objects.filter(criado_em__lt=timezone.now() - dt.timedelta(days=30)).delete()
    erro = ErroCliente.objects.create(
        origem=origem,
        tela=_texto(d.get('tela'), 200),
        mensagem=mensagem,
        stack=_texto(d.get('stack'), 8000),
        versao=_texto(d.get('versao'), 40),
        dispositivo=_texto(d.get('dispositivo'), 200),
        usuario=usuario,
        extra=d.get('extra') if isinstance(d.get('extra'), dict) else None,
    )
    logger.error(
        f'erro no cliente ({origem}): {mensagem}',
        extra={
            'origem': origem, 'tela': erro.tela, 'versao': erro.versao,
            'usuario': usuario.username if usuario else None, 'erro_cliente_id': erro.id,
        },
    )
    return Response({'id': erro.id}, status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
def listar_erros_cliente(request):
    """Admin → Saúde: últimos erros (default 24 h, máx. 200). Supervisores e admin."""
    if request.user.perfil not in PERFIS_GESTAO:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    try:
        horas = max(1, min(int(request.query_params.get('horas', 24)), 24 * 30))
    except (TypeError, ValueError):
        horas = 24
    qs = ErroCliente.objects.select_related('usuario').filter(
        criado_em__gte=timezone.now() - dt.timedelta(hours=horas),
    )
    origem = request.query_params.get('origem')
    if origem in ('web', 'mobile'):
        qs = qs.filter(origem=origem)
    return Response({
        'horas': horas,
        'total': qs.count(),
        'erros': [
            {
                'id': e.id, 'origem': e.origem, 'tela': e.tela, 'mensagem': e.mensagem,
                'stack': e.stack[:1500], 'versao': e.versao, 'dispositivo': e.dispositivo,
                'usuario': e.usuario.username if e.usuario else None,
                'extra': e.extra, 'criado_em': e.criado_em,
            }
            for e in qs[:200]
        ],
    })


# ---------------------------------------------------------------------------
# /metrics/ do django-prometheus (observabilidade, 2026-10-08)
# ---------------------------------------------------------------------------

_REDES_INTERNAS = ('10.', '127.', '172.16.', '172.17.', '172.18.', '172.19.', '172.2', '172.30.', '172.31.')


def metrics_protegido(request):
    """Expõe as métricas só para quem chega pela rede Docker (o mp-prometheus
    entra na `separa_default`). A porta 8003 é publicada na VM, então uma
    requisição direta da LAN (192.168.x) ou via proxy (X-Forwarded-For) leva 403.
    Em DEBUG libera para testar com curl."""
    from django.conf import settings as cfg
    from django.http import HttpResponseForbidden
    from django_prometheus.exports import ExportToDjangoView

    ip = request.META.get('REMOTE_ADDR', '')
    encaminhado = request.META.get('HTTP_X_FORWARDED_FOR')
    if not cfg.DEBUG and (encaminhado or not ip.startswith(_REDES_INTERNAS)):
        return HttpResponseForbidden('metrics: só pela rede interna')
    return ExportToDjangoView(request)
