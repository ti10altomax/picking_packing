import secrets
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from rest_framework import status

from apps.pedidos.models import (
    Lote, LotePedido, Impressora, Pedido, EtiquetaVtex,
    PedidoLog, PrintAgent, PrintJob,
)
from .printer import enviar_para_rede, enviar_para_agent, ping_impressora_rede
import logging

logger = logging.getLogger(__name__)


def _exige_admin(request):
    if request.user.perfil != 'admin':
        return Response({'erro': 'acesso restrito a administradores'}, status=status.HTTP_403_FORBIDDEN)
    return None


def _agent_from_request(request):
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Token '):
        return None
    token = auth.split(' ', 1)[1]
    return PrintAgent.objects.filter(token=token).first()


# ---------------------------------------------------------------------------
# Impressoras — listagem (todos os perfis autenticados)
# ---------------------------------------------------------------------------

@api_view(['GET'])
def listar_impressoras(request):
    impressoras = Impressora.objects.filter(ativa=True).values(
        'id', 'nome', 'modelo', 'tipo_conexao', 'formato_preferido',
        'mesa', 'ultimo_heartbeat',
    )
    return Response(list(impressoras))


# ---------------------------------------------------------------------------
# Impressoras — CRUD (admin)
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
def impressoras(request):
    err = _exige_admin(request)
    if err:
        return err

    if request.method == 'GET':
        qs = Impressora.objects.all().values(
            'id', 'nome', 'modelo', 'tipo_conexao', 'formato_preferido',
            'ip', 'porta', 'agent_id', 'dpi', 'largura_mm', 'altura_mm',
            'mesa', 'ativa', 'ultimo_heartbeat',
        )
        return Response(list(qs))

    dados = request.data
    campos_obrigatorios = ['nome', 'modelo', 'tipo_conexao']
    for campo in campos_obrigatorios:
        if not dados.get(campo):
            return Response({'erro': f'{campo} obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

    tipo = dados.get('tipo_conexao')
    if tipo not in (Impressora.TipoConexao.REDE, Impressora.TipoConexao.USB):
        return Response({'erro': 'tipo_conexao inválido'}, status=status.HTTP_400_BAD_REQUEST)

    imp = Impressora.objects.create(
        nome=dados['nome'],
        modelo=dados['modelo'],
        tipo_conexao=tipo,
        formato_preferido=dados.get('formato_preferido', Impressora.FormatoPreferido.ZPL),
        ip=dados.get('ip') or None,
        porta=int(dados.get('porta') or 9100),
        agent_id=dados.get('agent_id', ''),
        dpi=int(dados.get('dpi') or 203),
        largura_mm=int(dados.get('largura_mm') or 100),
        altura_mm=int(dados.get('altura_mm') or 150),
        mesa=dados.get('mesa', ''),
    )
    return Response({'id': imp.id, 'nome': imp.nome}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
def impressora_detalhe(request, pk):
    err = _exige_admin(request)
    if err:
        return err

    imp = get_object_or_404(Impressora, pk=pk)

    if request.method == 'GET':
        return Response({
            'id': imp.id,
            'nome': imp.nome,
            'modelo': imp.modelo,
            'tipo_conexao': imp.tipo_conexao,
            'formato_preferido': imp.formato_preferido,
            'ip': imp.ip,
            'porta': imp.porta,
            'agent_id': imp.agent_id,
            'dpi': imp.dpi,
            'largura_mm': imp.largura_mm,
            'altura_mm': imp.altura_mm,
            'mesa': imp.mesa,
            'ativa': imp.ativa,
            'ultimo_heartbeat': imp.ultimo_heartbeat,
        })

    if request.method == 'DELETE':
        imp.ativa = False
        imp.save(update_fields=['ativa'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PUT / PATCH
    d = request.data
    campos = ['nome', 'modelo', 'tipo_conexao', 'formato_preferido',
              'ip', 'porta', 'agent_id', 'dpi', 'largura_mm', 'altura_mm', 'mesa', 'ativa']
    for campo in campos:
        if campo in d:
            valor = d[campo]
            if campo in ('porta', 'dpi', 'largura_mm', 'altura_mm') and valor is not None:
                valor = int(valor)
            setattr(imp, campo, valor)
    imp.save()
    return Response({'id': imp.id, 'nome': imp.nome})


@api_view(['POST'])
def testar_impressora(request, pk):
    err = _exige_admin(request)
    if err:
        return err

    imp = get_object_or_404(Impressora, pk=pk)

    if imp.tipo_conexao == Impressora.TipoConexao.REDE:
        if not imp.ip:
            return Response({'online': False, 'motivo': 'IP não configurado'})
        online = ping_impressora_rede(imp.ip, imp.porta)
        return Response({'online': online, 'motivo': None if online else f'TCP {imp.ip}:{imp.porta} sem resposta'})

    # USB — verifica heartbeat do agent
    if not imp.agent_id:
        return Response({'online': False, 'motivo': 'agent_id não configurado'})
    agent = PrintAgent.objects.filter(token=imp.agent_id).first()
    if not agent or not agent.ultimo_heartbeat:
        return Response({'online': False, 'motivo': 'agent não registrado ou sem heartbeat'})
    delta = (timezone.now() - agent.ultimo_heartbeat).total_seconds()
    online = delta < 120
    return Response({'online': online, 'motivo': None if online else f'último heartbeat há {int(delta)}s'})


# ---------------------------------------------------------------------------
# PrintAgent — registro e heartbeat (chamados pelo agent local)
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([])
def registrar_agent(request):
    hostname = request.data.get('hostname', '')
    versao = request.data.get('versao', '')
    if not hostname:
        return Response({'erro': 'hostname obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
    token = secrets.token_hex(32)
    agent = PrintAgent.objects.create(hostname=hostname, token=token, versao=versao)
    return Response({'id': agent.id, 'token': token}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([])
def heartbeat_agent(request):
    agent = _agent_from_request(request)
    if not agent:
        return Response({'erro': 'token inválido'}, status=status.HTTP_401_UNAUTHORIZED)
    versao = request.data.get('versao', '')
    agent.ultimo_heartbeat = timezone.now()
    if versao:
        agent.versao = versao
    agent.save(update_fields=['ultimo_heartbeat', 'versao'])

    # atualiza também o ultimo_heartbeat da(s) impressora(s) vinculadas
    Impressora.objects.filter(agent_id=agent.token).update(ultimo_heartbeat=agent.ultimo_heartbeat)
    return Response({'ok': True})


@api_view(['GET'])
@permission_classes([])
def jobs_pendentes(request):
    agent = _agent_from_request(request)
    if not agent:
        return Response({'erro': 'token inválido'}, status=status.HTTP_401_UNAUTHORIZED)

    impressoras_ids = list(
        Impressora.objects.filter(agent_id=agent.token, ativa=True).values_list('id', flat=True)
    )
    jobs = PrintJob.objects.filter(
        impressora_id__in=impressoras_ids,
        status=PrintJob.Status.PENDENTE,
    ).values('id', 'impressora_id', 'conteudo', 'criado_em')

    result = []
    for job in jobs:
        result.append({
            'id': job['id'],
            'impressora_id': job['impressora_id'],
            'conteudo': bytes(job['conteudo']).hex(),
            'criado_em': job['criado_em'],
        })
    return Response(result)


@api_view(['POST'])
@permission_classes([])
def ack_job(request, job_id):
    agent = _agent_from_request(request)
    if not agent:
        return Response({'erro': 'token inválido'}, status=status.HTTP_401_UNAUTHORIZED)

    job = get_object_or_404(PrintJob, pk=job_id)
    erro = request.data.get('erro', '')
    job.status = PrintJob.Status.ERRO if erro else PrintJob.Status.RETIRADO
    job.retirado_em = timezone.now()
    job.erro = erro
    job.save(update_fields=['status', 'retirado_em', 'erro'])
    return Response({'ok': True})


@api_view(['GET'])
def listar_agents(request):
    err = _exige_admin(request)
    if err:
        return err
    agents = PrintAgent.objects.all().order_by('-criado_em').values(
        'id', 'hostname', 'token', 'versao', 'criado_em', 'ultimo_heartbeat'
    )
    return Response(list(agents))


# ---------------------------------------------------------------------------
# Lotes
# ---------------------------------------------------------------------------

@api_view(['POST'])
def criar_lote(request):
    impressora_id = request.data.get('impressora_id')
    if not impressora_id:
        return Response({'erro': 'impressora_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

    impressora = get_object_or_404(Impressora, pk=impressora_id, ativa=True)

    pedidos = list(
        Pedido.objects.filter(
            status=Pedido.Status.AGUARDANDO_ETIQUETAR,
            etiqueta_impressa_em__isnull=True,
        ).order_by('-ordem_pilha')
    )

    if not pedidos:
        return Response({'erro': 'nenhum pedido aguardando etiquetagem'}, status=status.HTTP_400_BAD_REQUEST)

    lote = Lote.objects.create(
        etiquetador=request.user,
        impressora=impressora,
        mesa=impressora.mesa,
        qtd_pedidos=len(pedidos),
    )

    etiquetas = []
    for i, pedido in enumerate(pedidos, start=1):
        LotePedido.objects.create(lote=lote, pedido=pedido, ordem=i)
        try:
            etiquetas.append(bytes(pedido.etiqueta_vtex.conteudo))
        except EtiquetaVtex.DoesNotExist:
            logger.warning(f"Pedido {pedido.id} sem etiqueta VTEX, incluindo no lote sem imprimir")
        pedido.etiqueta_impressa_em = timezone.now()
        pedido.save(update_fields=['etiqueta_impressa_em'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='etiqueta_impressa', payload={'lote_id': lote.id},
        )

    if etiquetas:
        job = b''.join(etiquetas)
        try:
            if impressora.tipo_conexao == Impressora.TipoConexao.REDE:
                enviar_para_rede(impressora.ip, impressora.porta, job)
            else:
                enviar_para_agent(impressora, job)
        except Exception as exc:
            logger.error(f"Erro ao enviar lote {lote.id} para impressora: {exc}")

    return Response({'lote_id': lote.id, 'qtd_pedidos': lote.qtd_pedidos})


@api_view(['GET'])
def detalhe_lote(request, pk):
    lote = get_object_or_404(Lote, pk=pk)
    itens = lote.itens.select_related('pedido').order_by('ordem')
    confirmados = sum(1 for i in itens if i.confirmado_em)
    return Response({
        'id': lote.id,
        'criado_em': lote.criado_em,
        'finalizado_em': lote.finalizado_em,
        'qtd_pedidos': lote.qtd_pedidos,
        'confirmados': confirmados,
        'mesa': lote.mesa,
        'itens': [
            {
                'id': item.id,
                'ordem': item.ordem,
                'confirmado_em': item.confirmado_em,
                'pedido': {
                    'id': item.pedido.id,
                    'numero_externo': item.pedido.numero_externo,
                    'cliente': item.pedido.cliente,
                    'endereco_fisico': item.pedido.endereco_fisico,
                },
            }
            for item in itens
        ],
    })


@api_view(['POST'])
def confirmar_pedido_lote(request, pk):
    lote = get_object_or_404(Lote, pk=pk, finalizado_em__isnull=True)
    codigo = request.data.get('codigo', '').strip()
    if not codigo:
        return Response({'erro': 'código obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

    lote_pedido = (
        lote.itens
        .filter(pedido__numero_externo=codigo, confirmado_em__isnull=True)
        .select_related('pedido')
        .first()
    )

    if not lote_pedido:
        already = lote.itens.filter(pedido__numero_externo=codigo).exists()
        if already:
            return Response({'resultado': 'ja_confirmado'}, status=status.HTTP_409_CONFLICT)
        return Response({'resultado': 'nao_encontrado'}, status=status.HTTP_404_NOT_FOUND)

    lote_pedido.confirmado_em = timezone.now()
    lote_pedido.save(update_fields=['confirmado_em'])
    PedidoLog.objects.create(
        pedido=lote_pedido.pedido, usuario=request.user,
        acao='pedido_confirmado_lote', payload={'lote_id': lote.id},
    )

    total = lote.itens.count()
    confirmados = lote.itens.filter(confirmado_em__isnull=False).count()
    return Response({
        'resultado': 'ok',
        'pedido_id': lote_pedido.pedido.id,
        'confirmados': confirmados,
        'total': total,
    })


@api_view(['POST'])
def finalizar_lote(request, pk):
    lote = get_object_or_404(Lote, pk=pk, finalizado_em__isnull=True)

    nao_confirmados = lote.itens.filter(confirmado_em__isnull=True).count()
    if nao_confirmados:
        return Response(
            {'erro': f'{nao_confirmados} pedido(s) ainda não confirmados'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lote.finalizado_em = timezone.now()
    lote.save(update_fields=['finalizado_em'])

    for item in lote.itens.select_related('pedido'):
        item.pedido.status = Pedido.Status.CONCLUIDO
        item.pedido.etiquetador = request.user
        item.pedido.save(update_fields=['status', 'etiquetador'])
        PedidoLog.objects.create(
            pedido=item.pedido, usuario=request.user,
            acao='pedido_concluido', payload={'lote_id': lote.id},
        )

    return Response({'finalizado': True, 'qtd_pedidos': lote.qtd_pedidos})


@api_view(['GET'])
def lote_ativo(request):
    lote = (
        Lote.objects.filter(etiquetador=request.user, finalizado_em__isnull=True)
        .order_by('-criado_em')
        .first()
    )
    if not lote:
        return Response(None)
    return Response({'lote_id': lote.id, 'qtd_pedidos': lote.qtd_pedidos, 'criado_em': lote.criado_em})


@api_view(['POST'])
def imprimir_lote(request):
    """Endpoint legado — envia etiquetas de pedidos específicos para a impressora."""
    pedido_ids = request.data.get('pedido_ids', [])
    impressora_id = request.data.get('impressora_id')

    if not pedido_ids or not impressora_id:
        return Response({'erro': 'pedido_ids e impressora_id obrigatórios'}, status=status.HTTP_400_BAD_REQUEST)

    impressora = Impressora.objects.get(pk=impressora_id)
    pedidos = Pedido.objects.filter(
        pk__in=pedido_ids,
        status=Pedido.Status.AGUARDANDO_ETIQUETAR,
    ).order_by('-ordem_pilha')

    etiquetas = []
    for pedido in pedidos:
        try:
            etiquetas.append(bytes(pedido.etiqueta_vtex.conteudo))
        except EtiquetaVtex.DoesNotExist:
            logger.warning(f"Pedido {pedido.id} sem etiqueta VTEX, pulando")

    if not etiquetas:
        return Response({'erro': 'nenhuma etiqueta disponível'}, status=status.HTTP_400_BAD_REQUEST)

    job = b''.join(etiquetas)
    if impressora.tipo_conexao == Impressora.TipoConexao.REDE:
        enviar_para_rede(impressora.ip, impressora.porta, job)
    else:
        enviar_para_agent(impressora, job)

    return Response({'impresso': len(etiquetas)})
