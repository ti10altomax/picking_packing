from django.db.models import Q
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import Configuracao
from apps.pedidos.models import Pedido

from . import senior, services
from .models import CartaCorrecao
from .services import PERFIS_CCE, ErroCarta


def _exige(request, perfis=PERFIS_CCE):
    if request.user.perfil not in perfis:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


def _erro(e: ErroCarta):
    return Response({'erro': e.mensagem, 'codigo': e.codigo}, status=e.http)


@api_view(['GET'])
def preparar(request, pk):
    """Tudo que a tela precisa antes de confirmar: elegibilidade, situação no Senior,
    cartas anteriores, transportadora/frete atuais, cartas já feitas pelo Separa, modo."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    return Response(services.preparar(pedido))


@api_view(['POST'])
def previa(request, pk):
    """Texto da carta como vai ser enviado (sem chamar o Senior)."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        return Response(services.previa(
            pedido,
            str(request.data.get('codtra') or ''),
            str(request.data.get('frete') or '').upper(),
            str(request.data.get('complemento') or ''),
        ))
    except ErroCarta as e:
        return _erro(e)


@api_view(['POST'])
def executar(request, pk):
    """Grava a carta (e transmite, conforme o modo). Body: {codtra, frete?, complemento?}."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        carta = services.executar(
            pedido, request.user,
            str(request.data.get('codtra') or ''),
            str(request.data.get('frete') or ''),
            str(request.data.get('complemento') or ''),
        )
    except ErroCarta as e:
        return _erro(e)
    pedido.refresh_from_db()
    return Response({
        'carta': services.serializar(carta),
        'pedido': {'id': pedido.id, 'codtra': pedido.codtra, 'transportadora': pedido.transportadora, 'frete': pedido.frete},
    }, status=http_status.HTTP_201_CREATED)


@api_view(['GET'])
def transportadoras(request):
    err = _exige(request)
    if err:
        return err
    try:
        lista = senior.transportadoras(request.query_params.get('q', ''))
    except Exception as e:
        return Response({'erro': f'Senior (Oracle) indisponível: {e}'}, status=http_status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({'transportadoras': lista})


@api_view(['GET'])
def listar(request):
    """Cartas feitas pelo Separa (Gestão → Cartas de correção). ?status= ?search= ?pedido="""
    err = _exige(request)
    if err:
        return err
    qs = CartaCorrecao.objects.select_related('pedido', 'usuario')
    st = request.query_params.get('status', '').strip()
    if st:
        qs = qs.filter(status=st)
    pedido_id = request.query_params.get('pedido', '').strip()
    if pedido_id.isdigit():
        qs = qs.filter(pedido_id=int(pedido_id))
    search = request.query_params.get('search', '').strip()
    if search:
        qs = qs.filter(Q(pedido__numero_externo__icontains=search) | Q(pedido__cliente__icontains=search)
                       | Q(transportadora_nova__icontains=search) | Q(transportadora_anterior__icontains=search))
    return Response({'cartas': [services.serializar(c) for c in qs[:200]], 'config': services.configuracao()})


@api_view(['GET', 'PUT'])
def config(request):
    """Modo (desligado | gravar | gravar_e_transmitir) e tipGer. Leitura: gestão; escrita: admin."""
    err = _exige(request)
    if err:
        return err
    if request.method == 'PUT':
        err = _exige(request, ('admin',))
        if err:
            return err
        if 'modo' in request.data:
            modo = str(request.data.get('modo') or '')
            if modo not in services.MODOS:
                return Response({'erro': f'modo inválido; use {", ".join(services.MODOS)}'}, status=http_status.HTTP_400_BAD_REQUEST)
            Configuracao.objects.update_or_create(chave=Configuracao.Chave.CCE_MODO, defaults={'valor': modo})
        if 'tipger' in request.data:
            tipger = str(request.data.get('tipger') or '')
            if tipger not in ('1', '2'):
                return Response({'erro': 'tipger deve ser 1 (gerar XML) ou 2 (eDocs)'}, status=http_status.HTTP_400_BAD_REQUEST)
            Configuracao.objects.update_or_create(chave=Configuracao.Chave.CCE_TIPGER, defaults={'valor': tipger})
    return Response(services.configuracao())
