from django.db.models import Q
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import Configuracao
from apps.pedidos.models import Pedido
from apps.pedidos.nf_vinculo import aplicar_vinculo, descobrir_nf, pedidos_da_nf

from . import senior, services
from .models import CartaCorrecao
from .services import PERFIS_CCE, ErroCarta


def _exige(request, perfis=PERFIS_CCE):
    if request.user.perfil not in perfis:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


def _erro(e: ErroCarta):
    return Response({'erro': e.mensagem, 'codigo': e.codigo}, status=e.http)


def _corpo(request) -> tuple[str, str, str, str]:
    d = request.data
    return (
        str(d.get('codtra') or ''),
        str(d.get('frete') or '').upper(),
        '' if d.get('volumes') is None else str(d.get('volumes')),
        str(d.get('complemento') or ''),
    )


@api_view(['GET'])
def preparar(request, pk):
    """Tudo que a tela precisa antes de confirmar: elegibilidade, NF alvo (própria ou vinculada
    ao pedido), situação no Senior, cartas anteriores, transportadora/frete/volumes atuais,
    cartas já feitas pelo Separa, modo."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    return Response(services.preparar(pedido))


@api_view(['POST'])
def previa(request, pk):
    """Texto da carta como vai ser enviado (sem chamar o WS). Body: {codtra?, frete?, volumes?, complemento?}."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        return Response(services.previa(pedido, *_corpo(request)))
    except ErroCarta as e:
        return _erro(e)


@api_view(['POST'])
def executar(request, pk):
    """Grava a carta (e transmite, conforme o modo). Body: {codtra?, frete?, volumes?, complemento?}."""
    err = _exige(request)
    if err:
        return err
    pedido = get_object_or_404(Pedido, pk=pk)
    try:
        carta = services.executar(pedido, request.user, *_corpo(request))
    except ErroCarta as e:
        return _erro(e)
    pedido.refresh_from_db()
    return Response({
        'carta': services.serializar(carta),
        'pedido': {'id': pedido.id, 'codtra': pedido.codtra, 'transportadora': pedido.transportadora, 'frete': pedido.frete,
                   'nf_numero': pedido.nf_numero},
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


def _doc(p: Pedido) -> dict:
    return {
        'id': p.id, 'numero_externo': p.numero_externo, 'tipo': p.tipo, 'status': p.status,
        'frete': p.frete, 'cliente': p.cliente, 'codtra': p.codtra, 'transportadora': p.transportadora,
        'codfil': p.codfil, 'codsnf': p.codsnf, 'nf_codsnf': p.nf_codsnf, 'nf_numero': p.nf_numero,
    }


@api_view(['GET'])
def documentos(request):
    """Busca do documento para a carta (Gestão → Cartas de correção): número do pedido, número da
    NF (própria ou já vinculada) ou cliente. Número que não bate com nada local → pergunta ao Senior
    de qual pedido a NF saiu (E140IPV), vincula e devolve esse pedido."""
    err = _exige(request)
    if err:
        return err
    q = request.query_params.get('q', '').strip()
    if not q:
        return Response({'documentos': [], 'origem_senior': False, 'aviso': ''})
    qs = (Pedido.objects.filter(Q(numero_externo__icontains=q) | Q(nf_numero__icontains=q) | Q(cliente__icontains=q))
          .order_by('-criado_em'))
    docs = list(qs[:15])
    origem_senior = False
    aviso = ''
    if q.isdigit() and not any(d.numero_externo == q or d.nf_numero == q for d in docs):
        try:
            rows = pedidos_da_nf(q)
        except Exception as e:
            rows = []
            aviso = f'Não consegui consultar a NF {q} no Senior: {e}'
        fora = []
        for r in rows:
            numped = str(int(r['numped']))
            filped = str(int(r['filped'])) if r.get('filped') is not None else ''
            achados = list(Pedido.objects.filter(tipo=Pedido.Tipo.PEDIDO, numero_externo=numped)
                           .filter(Q(codfil=filped) | Q(codfil='')))
            if not achados:
                fora.append(numped)
                continue
            for p in achados:
                # linha completa (codtra/ciffob/qtdemb) quando der; a linha da busca inversa é magra
                if not descobrir_nf(p):
                    aplicar_vinculo(p, r)
                origem_senior = True
                if all(d.id != p.id for d in docs):
                    docs.insert(0, p)
        if fora:
            aviso = f"A NF {q} saiu do pedido {', '.join(fora)}, que não está no Separa."
        elif not rows and not aviso:
            aviso = f'NF {q} não encontrada no Senior como nota de pedido.'
    return Response({'documentos': [_doc(p) for p in docs], 'origem_senior': origem_senior, 'aviso': aviso})


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
        qs = qs.filter(Q(pedido__numero_externo__icontains=search) | Q(nf_numero__icontains=search)
                       | Q(pedido__cliente__icontains=search)
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
