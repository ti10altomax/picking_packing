from django.http import HttpResponse
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.core.models import Configuracao
from apps.pedidos.models import Impressora, Pedido

from . import services
from .etiqueta import dados_etiquetas
from .models import ImpressaoEtiqueta
from .zpl import gerar_zpl

PERFIS_GESTAO = ('supervisor_patio', 'supervisor_vendas', 'admin')


def _exige(request, perfis):
    if request.user.perfil not in perfis:
        return Response({'erro': 'sem permissão'}, status=http_status.HTTP_403_FORBIDDEN)
    return None


def _serializar_impressao(i: ImpressaoEtiqueta) -> dict:
    return {
        'id': i.id,
        'criado_em': i.criado_em,
        'canal': i.canal,
        'canal_label': i.get_canal_display(),
        'status': i.status,
        'impressora': i.impressora.nome if i.impressora else None,
        'impressora_id': i.impressora_id,
        'qtd_etiquetas': i.qtd_etiquetas,
        'automatica': i.automatica,
        'usuario': i.usuario.username if i.usuario else None,
        'erro': i.erro,
    }


def _serializar_impressora(imp: Impressora, padrao_id: int | None) -> dict:
    return {
        'id': imp.id,
        'nome': imp.nome,
        'modelo': imp.modelo,
        'tipo_conexao': imp.tipo_conexao,
        'mesa': imp.mesa,
        'ip': imp.ip,
        'porta': imp.porta,
        'ultimo_heartbeat': imp.ultimo_heartbeat,
        'padrao': imp.id == padrao_id,
    }


# ---------------------------------------------------------------------------
# Etiquetas de um pedido
# ---------------------------------------------------------------------------

@api_view(['GET'])
def etiquetas(request, pk):
    """Conteúdo das etiquetas (para a página HTML) + histórico + bloqueio, se houver."""
    pedido = get_object_or_404(Pedido.objects.select_related('conferente', 'sequencia'), pk=pk)
    dados = dados_etiquetas(pedido)
    dados['bloqueio'] = services.motivo_bloqueio(pedido)
    dados['impressoes'] = [
        _serializar_impressao(i)
        for i in pedido.impressoes_etiqueta.select_related('impressora', 'usuario')[:20]
    ]
    return Response(dados)


@api_view(['GET'])
def etiquetas_zpl(request, pk):
    """ZPL cru — para testar numa Zebra à mão ou no labelary.com."""
    pedido = get_object_or_404(Pedido.objects.select_related('conferente', 'sequencia'), pk=pk)
    dados = dados_etiquetas(pedido)
    imp = None
    if request.query_params.get('impressora'):
        imp = Impressora.objects.filter(pk=request.query_params['impressora']).first()
    zpl = gerar_zpl(
        dados,
        dpi=(imp.dpi if imp else 203),
        largura_mm=(imp.largura_mm if imp else 100),
        altura_mm=(imp.altura_mm if imp else 150),
    )
    return HttpResponse(zpl, content_type='text/plain; charset=utf-8')


@api_view(['POST'])
def imprimir(request, pk):
    """Dispara a impressão: `{impressora_id}` (rede ou USB) ou `{canal: 'navegador'}`
    (o usuário imprimiu a página HTML e estamos só registrando). Sem nenhum dos
    dois, usa a impressora padrão."""
    pedido = get_object_or_404(Pedido.objects.select_related('conferente', 'sequencia'), pk=pk)
    canal = (request.data.get('canal') or '').strip()
    impressora = None
    if canal != ImpressaoEtiqueta.Canal.NAVEGADOR:
        imp_id = request.data.get('impressora_id')
        if imp_id:
            impressora = Impressora.objects.filter(pk=imp_id).first()
            if impressora is None:
                return Response({'erro': 'impressora não encontrada'}, status=http_status.HTTP_404_NOT_FOUND)
        else:
            impressora = services.impressora_padrao()
            if impressora is None:
                return Response(
                    {'resultado': 'sem_impressora', 'erro': 'informe impressora_id ou canal=navegador'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

    try:
        reg = services.imprimir(pedido, impressora=impressora, canal=canal or None, usuario=request.user)
    except services.ErroImpressao as e:
        return Response({'resultado': e.codigo, 'erro': e.mensagem}, status=http_status.HTTP_409_CONFLICT)

    ok = reg.status == ImpressaoEtiqueta.Status.OK
    return Response(
        {'resultado': 'ok' if ok else 'erro', 'erro': reg.erro or None, 'impressao': _serializar_impressao(reg)},
        status=http_status.HTTP_200_OK if ok else http_status.HTTP_502_BAD_GATEWAY,
    )


# ---------------------------------------------------------------------------
# Pendentes (gestão)
# ---------------------------------------------------------------------------

@api_view(['GET'])
def pendentes(request):
    err = _exige(request, PERFIS_GESTAO)
    if err:
        return err
    lista = []
    for p in services.pendentes_qs():
        ultimo_erro = p.impressoes_etiqueta.filter(status=ImpressaoEtiqueta.Status.ERRO).first()
        lista.append({
            'id': p.id,
            'tipo': p.tipo,
            'numero_externo': p.numero_externo,
            'frete': p.frete,
            'cliente': p.cliente,
            'transportadora': p.transportadora,
            'conferido_em': p.conferido_em,
            'conferente': p.conferente.username if p.conferente else None,
            'sequencia_numero': p.sequencia.numero if p.sequencia else None,
            'qtd_volumes': services.qtd_volumes_com_itens(p),
            'pronta': bool((p.transportadora or '').strip()),
            'ultimo_erro': ultimo_erro.erro if ultimo_erro else None,
        })
    return Response({
        'prontas': [x for x in lista if x['pronta']],
        'aguardando_transportadora': [x for x in lista if not x['pronta']],
    })


# ---------------------------------------------------------------------------
# Impressoras + configuração
# ---------------------------------------------------------------------------

@api_view(['GET'])
def impressoras(request):
    """Impressoras ativas para o seletor (todos os perfis) + padrão + automática."""
    padrao = services.impressora_padrao()
    padrao_id = padrao.id if padrao else None
    return Response({
        'impressoras': [
            _serializar_impressora(i, padrao_id)
            for i in Impressora.objects.filter(ativa=True).order_by('mesa', 'nome')
        ],
        'impressora_padrao': padrao_id,
        'automatica': services.impressao_automatica_ligada(),
    })


@api_view(['GET', 'PUT'])
def config(request):
    err = _exige(request, ('admin',))
    if err:
        return err
    if request.method == 'PUT':
        if 'impressora_padrao' in request.data:
            valor = request.data.get('impressora_padrao')
            if valor in (None, '', 0, '0'):
                valor = ''
            else:
                if not Impressora.objects.filter(pk=valor, ativa=True).exists():
                    return Response({'erro': 'impressora inválida ou inativa'}, status=http_status.HTTP_400_BAD_REQUEST)
                valor = str(valor)
            Configuracao.objects.update_or_create(
                chave=Configuracao.Chave.IMPRESSORA_PADRAO, defaults={'valor': valor},
            )
        if 'automatica' in request.data:
            Configuracao.objects.update_or_create(
                chave=Configuracao.Chave.ETIQUETA_AUTOMATICA,
                defaults={'valor': 'sim' if request.data.get('automatica') else 'nao'},
            )
    padrao = services.impressora_padrao()
    return Response({
        'impressora_padrao': padrao.id if padrao else None,
        'impressora_padrao_nome': padrao.nome if padrao else None,
        'automatica': services.impressao_automatica_ligada(),
    })
