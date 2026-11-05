from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.generics import get_object_or_404
from django.db import models
from django.db.models import Case, Count, IntegerField, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from .models import DivergenciaBarra, Pedido, PedidoItem, PedidoLog
from .nf_vinculo import conflito_conferencia_dupla
from .serializers import PedidoSerializer, PedidoListSerializer


def _localizacao(p: Pedido, numero: str) -> dict:
    """Uma linha do `localizar`: em que etapa o documento está, em palavras, e em que lista
    ele aparece (`lista` — web e mobile traduzem para a rota)."""
    S = Pedido.Status
    conferente = p.conferente.username if p.conferente else ''
    seq = f'sequência {p.sequencia.numero}' if p.sequencia else ''
    quando = timezone.localtime(p.conferido_em).strftime('%d/%m %H:%M') if p.conferido_em else ''
    lista, descricao = {
        S.PENDENTE: ('vendas', 'ainda não foi enviado para conferência'),
        S.SELECIONADO: ('sequencia' if seq else 'patio',
                        f'na {seq}, sem conferente' if seq else 'na fila do Sup. Pátio, sem sequência'),
        S.ATRIBUIDO: ('sequencia', f'atribuído a {conferente or "—"}' + (f' na {seq}' if seq else '')),
        S.CONFERINDO: ('sequencia', f'em conferência com {conferente or "—"}' + (f' ({seq})' if seq else '')),
        S.AGUARDANDO_FECHAMENTO: ('fechamentos', 'conferido com sobra, esperando o Sup. Pátio fechar'),
        S.CONFERIDO: ('conferidos', f'conferido{" em " + quando if quando else ""}{" por " + conferente if conferente else ""}'),
        S.NAO_CONFORME: ('nao_conformes', f'marcado como não conforme{" por " + conferente if conferente else ""}'),
        S.CANCELADO: ('cancelados', (p.get_cancelado_origem_display() if p.cancelado_origem else 'cancelado').lower()),
    }.get(p.status, ('', p.get_status_display()))
    # como o número bateu: o próprio documento, a NF do pedido faturado ou o pedido de origem da NF
    if p.numero_externo == numero:
        via = ''
    elif p.nf_numero == numero:
        via = f'NF {numero} é do pedido {p.numero_externo}'
    else:
        via = f'NF {p.numero_externo}, que saiu do pedido {numero}'
    return {
        'id': p.id, 'tipo': p.tipo, 'numero_externo': p.numero_externo,
        'status': p.status, 'status_label': p.get_status_display(),
        'descricao': descricao, 'via': via, 'lista': lista,
        'sequencia': p.sequencia_id, 'sequencia_numero': p.sequencia.numero if p.sequencia else None,
        'conferente': conferente or None,
    }


class PedidoViewSet(viewsets.ModelViewSet):
    serializer_class = PedidoSerializer
    http_method_names = ['get', 'patch', 'post']

    def get_serializer_class(self):
        if self.action == 'list':
            return PedidoListSerializer
        return PedidoSerializer

    def get_queryset(self):
        if self.action == 'list':
            # Listagem slim — sem prefetch de itens, com qtd_itens anotada.
            # Subqueries correlacionadas em vez de Count() com join: o Postgres só
            # conta para as linhas da página (após ORDER BY/LIMIT) e o COUNT(*) da
            # paginação não arrasta os joins — a lista de pendentes caía de ~1 s
            # para dezenas de ms com 12k pedidos.
            qtd_itens = (
                PedidoItem.objects.filter(pedido=OuterRef('pk'))
                .order_by().values('pedido').annotate(c=Count('id')).values('c')
            )
            qtd_divergencias = (
                DivergenciaBarra.objects.filter(pedido_item__pedido=OuterRef('pk'))
                .order_by().values('pedido_item__pedido').annotate(c=Count('id')).values('c')
            )
            from apps.impressao.models import ImpressaoEtiqueta
            etiqueta_volume_em = (
                ImpressaoEtiqueta.objects.filter(pedido=OuterRef('pk'), status='ok')
                .order_by('-criado_em').values('criado_em')[:1]
            )
            qs = Pedido.objects.select_related('conferente', 'separado_por', 'sequencia').annotate(
                qtd_itens=Coalesce(Subquery(qtd_itens, output_field=IntegerField()), 0),
                qtd_divergencias=Coalesce(Subquery(qtd_divergencias, output_field=IntegerField()), 0),
                etiqueta_volume_em=Subquery(etiqueta_volume_em),
            )
        else:
            qs = Pedido.objects.select_related('marketplace', 'conferente', 'separado_por', 'sequencia').prefetch_related('itens')

        status_filter = self.request.query_params.get('status')
        marketplace = self.request.query_params.get('marketplace')
        tipo = self.request.query_params.get('tipo', '').strip()
        frete = self.request.query_params.get('frete', '').strip().upper()
        # 'com' | 'sem' — o Sup. Vendas quer saber antes de enviar se o documento já
        # tem transportadora (a etiqueta de volume só sai com ela), 2026-10-23.
        transportadora = self.request.query_params.get('transportadora', '').strip().lower()
        search = self.request.query_params.get('search', '').strip()

        if status_filter:
            qs = qs.filter(status=status_filter)
        if tipo:
            qs = qs.filter(tipo=tipo)
        if frete:
            qs = qs.filter(frete=frete)
        if transportadora == 'com':
            qs = qs.exclude(transportadora='')
        elif transportadora == 'sem':
            qs = qs.filter(transportadora='')
        if self.request.query_params.get('sem_sequencia') == '1':
            qs = qs.filter(sequencia__isnull=True)
        if marketplace:
            qs = qs.filter(marketplace__slug=marketplace)
        if search:
            # NF também pelo número: a do pedido faturado (`nf_numero`) e, pelo número do
            # pedido, as notas que saíram dele (`pedidos_origem`, faturamento parcial).
            filtro = Q(numero_externo__icontains=search) | Q(cliente__icontains=search) | Q(nf_numero__icontains=search)
            if search.isdigit():
                filtro |= Q(pedidos_origem__contains=[str(int(search))])
            qs = qs.filter(filtro)

        if self.request.query_params.get('ordem') == 'transportadora':
            # Ponto 3 da diretoria (2026-10-05): a fila do Pátio sai ordenada pela
            # transportadora com mais documentos nela. A contagem é sobre a fila inteira
            # (mesmos filtros de status/sequência/tipo/frete, SEM a busca) — a ordem não
            # muda conforme o que foi digitado, e o "carregar mais" continua coerente.
            # Documentos sem transportadora (retira, sem frete) vão para o fim.
            fila = Pedido.objects.filter(codtra=OuterRef('codtra'))
            if status_filter:
                fila = fila.filter(status=status_filter)
            if tipo:
                fila = fila.filter(tipo=tipo)
            if frete:
                fila = fila.filter(frete=frete)
            if transportadora == 'com':
                fila = fila.exclude(transportadora='')
            elif transportadora == 'sem':
                fila = fila.filter(transportadora='')
            if self.request.query_params.get('sem_sequencia') == '1':
                fila = fila.filter(sequencia__isnull=True)
            qtd_transportadora = (
                fila.order_by().values('codtra').annotate(c=Count('id')).values('c')
            )
            qs = qs.annotate(
                qtd_transportadora=Case(
                    When(codtra='', then=Value(0)),
                    default=Coalesce(Subquery(qtd_transportadora, output_field=IntegerField()), 0),
                    output_field=IntegerField(),
                ),
            )
            return qs.order_by('-qtd_transportadora', 'transportadora', '-criado_em')
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
    # Onde está o documento (2026-11-05): a busca de cada lista só olha um status, e
    # procurar em Vendas um pedido que já está em conferência voltava "nada". As telas
    # chamam isto quando a busca vem vazia e dizem em que etapa ele está.
    # ------------------------------------------------------------------
    @action(detail=False, methods=['get'])
    def localizar(self, request):
        q = request.query_params.get('q', '').strip()
        if not q.isdigit():
            return Response([])
        numero = str(int(q))
        docs = (
            Pedido.objects.filter(
                Q(numero_externo=numero) | Q(nf_numero=numero) | Q(pedidos_origem__contains=[numero]),
            )
            .exclude(status__in=('faturado', 'aguardando_etiquetar', 'concluido'))  # escopo antigo congelado
            .select_related('conferente', 'sequencia')
            .order_by('-criado_em')[:5]
        )
        return Response([_localizacao(p, numero) for p in docs])

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
        # Faturamento parcial (2026-11-05): o pedido e a NF que saiu dele não vão os dois
        # para a conferência — seria conferir a mesma mercadoria duas vezes.
        conflitos = []
        docs = list(qs)
        pedidos_no_lote = {d.numero_externo for d in docs if d.tipo == Pedido.Tipo.PEDIDO}
        juntos = {n for d in docs if d.tipo == Pedido.Tipo.NOTA_FISCAL for n in d.pedidos_origem or []} & pedidos_no_lote
        for doc in docs:
            junto = (doc.numero_externo in juntos if doc.tipo == Pedido.Tipo.PEDIDO
                     else bool(juntos & set(doc.pedidos_origem or [])))
            motivo = ('pedido e NF dele marcados juntos — escolha um dos dois' if junto
                      else conflito_conferencia_dupla(doc))
            if motivo:
                conflitos.append({'id': doc.id, 'numero': doc.numero_externo, 'tipo': doc.tipo, 'motivo': motivo})
        if conflitos:
            qs = qs.exclude(pk__in=[c['id'] for c in conflitos])
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
        return Response({'selecionados': atualizados, 'ignorados': ignorados, 'conflitos': conflitos})

    # ------------------------------------------------------------------
    # Sup. Pátio — DESATIVADO na Fase 3: atribuição agora é por sequência
    # (POST /api/sequencias/<id>/atribuir/). Mantido só para responder claro.
    # ------------------------------------------------------------------
    @action(detail=False, methods=['post'])
    def atribuir(self, request):
        return Response(
            {'erro': 'atribuição direta desativada — monte uma sequência e use /api/sequencias/<id>/atribuir/'},
            status=status.HTTP_410_GONE,
        )

    @action(detail=True, methods=['post'])
    def finalizar_separacao(self, request, pk=None):
        # LEGADO (escopo antigo) — nome do action preservado para manter a URL congelada
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
        pedido.conferente = request.user
        pedido.conferido_em = timezone.now()
        pedido.status = Pedido.Status.CONFERINDO
        pedido.save()

        from apps.senior.tasks import enviar_embalagem
        enviar_embalagem.delay(pedido.id)

        PedidoLog.objects.create(
            pedido=pedido, usuario=request.user,
            acao='separacao_finalizada',
            payload={'endereco': endereco},
        )
        return Response(PedidoSerializer(pedido).data)
