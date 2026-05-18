from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from django.db import models
from django.db.models import Count, Q
from django.utils import timezone
from apps.core.models import User
from .models import Pedido, PedidoItem, PedidoLog
from .serializers import PedidoSerializer, PedidoListSerializer


class PedidoViewSet(viewsets.ModelViewSet):
    serializer_class = PedidoSerializer
    http_method_names = ['get', 'patch', 'post']

    def get_serializer_class(self):
        if self.action == 'list':
            return PedidoListSerializer
        return PedidoSerializer

    def get_queryset(self):
        if self.action == 'list':
            # Listagem slim — sem prefetch de itens, com qtd_itens anotada
            qs = Pedido.objects.annotate(qtd_itens=Count('itens'))
        else:
            qs = Pedido.objects.select_related('marketplace').prefetch_related('itens')

        status_filter = self.request.query_params.get('status')
        marketplace = self.request.query_params.get('marketplace')
        search = self.request.query_params.get('search', '').strip()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if marketplace:
            qs = qs.filter(marketplace__slug=marketplace)
        if search:
            qs = qs.filter(Q(numero_externo__icontains=search) | Q(cliente__icontains=search))
        return qs.order_by('-criado_em')

    @action(detail=True, methods=['post'])
    def bipar_item(self, request, pk=None):
        pedido = self.get_object()
        codigo = request.data.get('codigo', '').strip()
        manual = bool(request.data.get('manual', False))

        if not codigo:
            return Response({'erro': 'código obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        item = pedido.itens.filter(
            models.Q(ean=codigo) | models.Q(sku=codigo),
            status=PedidoItem.Status.OK,
        ).first()

        if not item:
            PedidoLog.objects.create(
                pedido=pedido, usuario=request.user,
                acao='bip_manual' if manual else 'bip_nao_encontrado',
                payload={'codigo': codigo},
            )
            return Response({'resultado': 'nao_encontrado'}, status=status.HTTP_404_NOT_FOUND)

        if item.qtd_separada >= item.qtd_pedida:
            return Response({'resultado': 'excesso', 'item_id': item.id}, status=status.HTTP_409_CONFLICT)

        item.qtd_separada += 1
        item.save()
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='item_bipado',
            payload={'sku': item.sku, 'qtd_separada': item.qtd_separada, 'manual': manual},
        )
        return Response({
            'resultado': 'ok',
            'item_id': item.id,
            'qtd_separada': item.qtd_separada,
            'qtd_pedida': item.qtd_pedida,
        })

    @action(detail=True, methods=['post'])
    def cancelar_item(self, request, pk=None):
        pedido = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'erro': 'item_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        item = get_object_or_404(PedidoItem, pk=item_id, pedido=pedido)
        item.status = PedidoItem.Status.CANCELADO
        item.save()
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='item_cancelado', payload={'item_id': item_id, 'sku': item.sku},
        )
        return Response({'id': item.id, 'status': item.status})

    @action(detail=True, methods=['post'])
    def marcar_falta(self, request, pk=None):
        pedido = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'erro': 'item_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        item = get_object_or_404(PedidoItem, pk=item_id, pedido=pedido)
        item.status = PedidoItem.Status.FALTA
        item.save()
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='item_falta', payload={'item_id': item_id, 'sku': item.sku},
        )
        return Response({'id': item.id, 'status': item.status})

    @action(detail=True, methods=['post'])
    def atribuir_endereco(self, request, pk=None):
        pedido = self.get_object()
        endereco = request.data.get('endereco', '').strip().upper()
        if not endereco:
            return Response({'erro': 'endereço obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        pedido.endereco_fisico = endereco
        pedido.save()
        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='endereco_atribuido', payload={'endereco': endereco},
        )
        return Response({'endereco': pedido.endereco_fisico})

    # ------------------------------------------------------------------
    # Sup. Vendas — seleção em lote (Pendente → Selecionado)
    # ------------------------------------------------------------------
    @action(detail=False, methods=['post'])
    def selecionar(self, request):
        if request.user.perfil not in ('supervisor_vendas', 'admin'):
            return Response(
                {'erro': 'restrito ao Supervisor de Vendas'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ids = request.data.get('pedido_ids') or []
        if not isinstance(ids, list) or not ids:
            return Response({'erro': 'pedido_ids obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        agora = timezone.now()
        qs = Pedido.objects.filter(pk__in=ids, status=Pedido.Status.PENDENTE)
        atualizados = list(qs.values_list('id', flat=True))
        qs.update(
            status=Pedido.Status.SELECIONADO,
            selecionado_em=agora,
            selecionado_por=request.user,
        )
        for pid in atualizados:
            PedidoLog.objects.create(
                pedido_id=pid, usuario=request.user,
                acao='pedido_selecionado', payload={},
            )

        ignorados = [i for i in ids if i not in atualizados]
        return Response({'selecionados': atualizados, 'ignorados': ignorados})

    # ------------------------------------------------------------------
    # Sup. Pátio — atribuição em lote (Selecionado → Atribuído)
    # ------------------------------------------------------------------
    @action(detail=False, methods=['post'])
    def atribuir(self, request):
        if request.user.perfil not in ('supervisor_patio', 'admin'):
            return Response(
                {'erro': 'restrito ao Supervisor de Pátio'},
                status=status.HTTP_403_FORBIDDEN,
            )

        ids = request.data.get('pedido_ids') or []
        separador_id = request.data.get('separador_id')

        if not isinstance(ids, list) or not ids:
            return Response({'erro': 'pedido_ids obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        if not separador_id:
            return Response({'erro': 'separador_id obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        separador = User.objects.filter(
            pk=separador_id, perfil=User.Perfil.SEPARADOR, is_active=True,
        ).first()
        if not separador:
            return Response(
                {'erro': 'separador inválido ou inativo'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agora = timezone.now()
        qs = Pedido.objects.filter(pk__in=ids, status=Pedido.Status.SELECIONADO)
        atualizados = list(qs.values_list('id', flat=True))
        qs.update(
            status=Pedido.Status.ATRIBUIDO,
            atribuido_em=agora,
            atribuido_por=request.user,
            separador=separador,
        )
        for pid in atualizados:
            PedidoLog.objects.create(
                pedido_id=pid, usuario=request.user,
                acao='pedido_atribuido',
                payload={'separador_id': separador.id, 'separador': separador.username},
            )

        ignorados = [i for i in ids if i not in atualizados]
        return Response({
            'atribuidos': atualizados,
            'ignorados': ignorados,
            'separador': separador.username,
        })

    @action(detail=True, methods=['post'])
    def finalizar_separacao(self, request, pk=None):
        pedido = self.get_object()

        if pedido.status != Pedido.Status.PENDENTE:
            return Response(
                {'erro': f'Pedido está com status "{pedido.status}", esperado "pendente"'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        endereco = request.data.get('endereco', '').strip().upper()
        if not endereco:
            return Response({'erro': 'endereço obrigatório'}, status=status.HTTP_400_BAD_REQUEST)

        itens_pendentes = [
            i for i in pedido.itens.all()
            if i.status == PedidoItem.Status.OK and i.qtd_separada < i.qtd_pedida
        ]
        if itens_pendentes:
            return Response(
                {'erro': f'{len(itens_pendentes)} item(ns) pendentes de conferência'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pedido.endereco_fisico = endereco
        pedido.separador = request.user
        pedido.separado_em = timezone.now()
        pedido.status = Pedido.Status.SEPARANDO
        pedido.save()

        from apps.senior.tasks import enviar_embalagem
        enviar_embalagem.delay(pedido.id)

        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='separacao_finalizada',
            payload={'endereco': endereco},
        )
        return Response(PedidoSerializer(pedido).data)
