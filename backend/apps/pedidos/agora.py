"""Painel "agora no galpão" (observabilidade, 2026-10-08).

Uma leitura só, pensada para a tela do supervisor (polling de 15 s): quem está
conferindo o quê e há quanto tempo, quem parou de bipar, o tamanho de cada
fila, as sequências abertas e o ritmo da última hora. Tudo sai do Postgres
(Pedido, PedidoItem, PedidoLog, Sequencia, ImpressaoEtiqueta) — nada de
Prometheus aqui; o Grafana continua sendo o histórico, isto é o presente.
"""
import datetime as dt

from django.db.models import Count, OuterRef, Q, Subquery, Sum
from django.db.models.functions import TruncHour
from django.utils import timezone

from .models import Pedido, PedidoLog, Sequencia

PARADO_APOS_MIN = 20       # em conferência sem bip há mais de N min → "parado"
SEM_INICIAR_APOS_MIN = 30  # atribuído sem iniciar há mais de N min → entra na lista


def _min(desde, ate):
    return int((ate - desde).total_seconds() // 60) if desde else None


def painel() -> dict:
    agora = timezone.now()
    local = timezone.localtime(agora)
    hoje = local.replace(hour=0, minute=0, second=0, microsecond=0)
    uma_hora = agora - dt.timedelta(hours=1)
    S = Pedido.Status

    # ----- conferentes: o que cada um tem na mão -----
    ultimo_bip = (
        PedidoLog.objects.filter(pedido=OuterRef('pk'), acao='item_bipado')
        .order_by('-criado_em').values('criado_em')[:1]
    )
    em_andamento = (
        Pedido.objects
        .filter(status__in=[S.CONFERINDO, S.ATRIBUIDO], conferente__isnull=False)
        .select_related('conferente', 'sequencia', 'separado_por')
        .annotate(
            ultimo_bip_em=Subquery(ultimo_bip),
            qtd_pedida=Sum('itens__qtd_pedida', filter=Q(itens__status='ok')),
            qtd_separada=Sum('itens__qtd_separada', filter=Q(itens__status='ok')),
        )
        .order_by('conferencia_iniciada_em', 'atribuido_em')
    )
    bips_1h_por_usuario = dict(
        PedidoLog.objects.filter(acao='item_bipado', criado_em__gte=uma_hora)
        .values_list('usuario__username').annotate(n=Count('id')).values_list('usuario__username', 'n')
    )
    conferidos_hoje_por_usuario = dict(
        Pedido.objects.filter(status=S.CONFERIDO, conferido_em__gte=hoje)
        .values_list('conferente__username').annotate(n=Count('id')).values_list('conferente__username', 'n')
    )

    conferentes: dict[str, dict] = {}
    for p in em_andamento:
        nome = p.conferente.username
        c = conferentes.setdefault(nome, {
            'conferente': nome,
            'em_conferencia': None,
            'atribuidos': 0,
            'bips_1h': bips_1h_por_usuario.get(nome, 0),
            'conferidos_hoje': conferidos_hoje_por_usuario.get(nome, 0),
            'parado': False,
        })
        if p.status == S.CONFERINDO and c['em_conferencia'] is None:
            referencia = p.ultimo_bip_em or p.conferencia_iniciada_em
            parado_min = _min(referencia, agora)
            c['em_conferencia'] = {
                'id': p.id, 'tipo': p.tipo, 'numero_externo': p.numero_externo, 'cliente': p.cliente,
                'sequencia': p.sequencia.numero if p.sequencia else None,
                'separado_por': str(p.separado_por) if p.separado_por else None,
                'iniciada_em': p.conferencia_iniciada_em,
                'ha_min': _min(p.conferencia_iniciada_em, agora),
                'ultimo_bip_em': p.ultimo_bip_em,
                'sem_bip_min': parado_min,
                'qtd_pedida': p.qtd_pedida or 0,
                'qtd_separada': p.qtd_separada or 0,
            }
            c['parado'] = parado_min is not None and parado_min >= PARADO_APOS_MIN
        elif p.status == S.CONFERINDO:
            c['atribuidos'] += 1  # segundo documento "em conferência" do mesmo conferente — conta na fila dele
        else:
            c['atribuidos'] += 1

    lista_conferentes = sorted(
        conferentes.values(),
        key=lambda c: (c['em_conferencia'] is None, not c['parado'], c['conferente']),
    )

    # ----- atribuídos sem iniciar há tempo -----
    limite_sem_iniciar = agora - dt.timedelta(minutes=SEM_INICIAR_APOS_MIN)
    sem_iniciar = [
        {
            'id': p.id, 'tipo': p.tipo, 'numero_externo': p.numero_externo,
            'conferente': p.conferente.username if p.conferente else None,
            'sequencia': p.sequencia.numero if p.sequencia else None,
            'ha_min': _min(p.atribuido_em, agora),
        }
        for p in Pedido.objects.filter(status=S.ATRIBUIDO, atribuido_em__lt=limite_sem_iniciar)
        .select_related('conferente', 'sequencia').order_by('atribuido_em')[:10]
    ]

    # ----- filas -----
    from apps.impressao.services import pendentes_qs
    from apps.conferencia.views import STATUS_COM_CONFERENCIA  # lazy: evita ciclo de import
    etiquetas = pendentes_qs()
    atribuidos_qs = Pedido.objects.filter(status=S.ATRIBUIDO)
    mais_antigo = atribuidos_qs.order_by('atribuido_em').values_list('atribuido_em', flat=True).first()
    filas = {
        'selecionados_sem_sequencia': Pedido.objects.filter(status=S.SELECIONADO, sequencia__isnull=True).count(),
        'selecionados_em_sequencia': Pedido.objects.filter(status=S.SELECIONADO, sequencia__isnull=False).count(),
        'atribuidos': atribuidos_qs.count(),
        'atribuido_mais_antigo_min': _min(mais_antigo, agora),
        'em_conferencia': Pedido.objects.filter(status=S.CONFERINDO).count(),
        'aguardando_fechamento': Pedido.objects.filter(status=S.AGUARDANDO_FECHAMENTO).count(),
        'nao_conformes': Pedido.objects.filter(status=S.NAO_CONFORME).count(),
        'cancelados_a_transferir': Pedido.objects.filter(
            status=S.CANCELADO, status_anterior__in=STATUS_COM_CONFERENCIA, transferido_para__isnull=True,
        ).count(),
        'etiquetas_prontas': etiquetas.filter(transportadora__gt='').count(),
        'etiquetas_aguardando_transportadora': etiquetas.filter(transportadora='').count(),
        'conferidos_hoje': Pedido.objects.filter(status=S.CONFERIDO, conferido_em__gte=hoje).count(),
        'conferidos_1h': Pedido.objects.filter(status=S.CONFERIDO, conferido_em__gte=uma_hora).count(),
        'bips_1h': PedidoLog.objects.filter(acao='item_bipado', criado_em__gte=uma_hora).count(),
        'bips_hoje': PedidoLog.objects.filter(acao='item_bipado', criado_em__gte=hoje).count(),
        'divergencias_hoje': PedidoLog.objects.filter(acao='bip_codigo_divergente', criado_em__gte=hoje).count(),
        'cancelados_hoje': Pedido.objects.filter(status=S.CANCELADO, cancelado_em__gte=hoje).count(),
    }

    # ----- sequências abertas -----
    sequencias = []
    for seq in Sequencia.objects.exclude(status=Sequencia.Status.CONCLUIDA).order_by('numero'):
        por_status = dict(seq.pedidos.values_list('status').annotate(n=Count('id')).values_list('status', 'n'))
        nomes = sorted(set(
            seq.pedidos.filter(conferente__isnull=False).values_list('conferente__username', flat=True)
        ))
        sequencias.append({
            'id': seq.id, 'numero': seq.numero, 'status': seq.status,
            'total': sum(por_status.values()),
            'selecionados': por_status.get(S.SELECIONADO, 0),
            'atribuidos': por_status.get(S.ATRIBUIDO, 0),
            'em_conferencia': por_status.get(S.CONFERINDO, 0),
            'finalizados': sum(por_status.get(s, 0) for s in (S.CONFERIDO, S.AGUARDANDO_FECHAMENTO, S.NAO_CONFORME, S.CANCELADO)),
            # pendentes devolvidos à fila, legado etc. — ainda contam no total da sequência
            'outros': sum(v for k, v in por_status.items() if k not in (
                S.SELECIONADO, S.ATRIBUIDO, S.CONFERINDO, S.CONFERIDO, S.AGUARDANDO_FECHAMENTO, S.NAO_CONFORME, S.CANCELADO)),
            'conferentes': nomes,
            'criado_em': seq.criado_em,
        })

    # ----- ritmo por hora (hoje) -----
    bips_hora = dict(
        PedidoLog.objects.filter(acao='item_bipado', criado_em__gte=hoje)
        .annotate(h=TruncHour('criado_em')).values_list('h').annotate(n=Count('id')).values_list('h', 'n')
    )
    conf_hora = dict(
        Pedido.objects.filter(status=S.CONFERIDO, conferido_em__gte=hoje)
        .annotate(h=TruncHour('conferido_em')).values_list('h').annotate(n=Count('id')).values_list('h', 'n')
    )
    por_hora = []
    for h in range(0, local.hour + 1):
        marco = hoje + dt.timedelta(hours=h)  # aware: igualdade/hash por instante
        por_hora.append({'hora': f'{h:02d}h', 'bips': bips_hora.get(marco, 0), 'conferidos': conf_hora.get(marco, 0)})

    return {
        'gerado_em': agora,
        'conferentes': lista_conferentes,
        'sem_iniciar': sem_iniciar,
        'filas': filas,
        'sequencias': sequencias,
        'por_hora': por_hora,
        'parado_apos_min': PARADO_APOS_MIN,
        'sem_iniciar_apos_min': SEM_INICIAR_APOS_MIN,
    }
