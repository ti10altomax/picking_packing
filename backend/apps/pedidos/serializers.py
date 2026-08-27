from rest_framework import serializers
from django.utils import timezone
from django.utils.timesince import timesince
from .models import DivergenciaBarra, Pedido, PedidoItem


class PedidoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PedidoItem
        fields = ['id', 'sku', 'descricao', 'ean', 'qtd_pedida', 'qtd_separada', 'status']


def _nome_separado_por(obj):
    """Nome do separador apontado; 'Não identificado' fica destacado nos relatórios."""
    if obj.separado_por:
        return str(obj.separado_por)
    if obj.separador_nao_identificado:
        return 'Não identificado'
    return None


def _formatar_duracao(inicio, fim):
    """Formata o delta entre dois timestamps como '5min', '1h12min', '12s'."""
    if not inicio or not fim:
        return None
    total = int((fim - inicio).total_seconds())
    if total < 0:
        return None
    if total < 60:
        return f'{total}s'
    minutos, _ = divmod(total, 60)
    if minutos < 60:
        return f'{minutos}min'
    horas, minutos = divmod(minutos, 60)
    return f'{horas}h{minutos:02d}min'


class PedidoListSerializer(serializers.ModelSerializer):
    """Serializer slim para listagens (sem itens). Usa qtd_itens anotado no queryset."""
    qtd_itens = serializers.IntegerField(read_only=True)
    qtd_divergencias = serializers.IntegerField(read_only=True)
    tempo_espera = serializers.SerializerMethodField()
    duracao_conferencia = serializers.SerializerMethodField()
    conferente_username = serializers.CharField(source='conferente.username', read_only=True)
    separado_por_nome = serializers.SerializerMethodField()
    sequencia_numero = serializers.IntegerField(source='sequencia.numero', read_only=True)

    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_externo', 'cliente', 'status', 'criado_em',
            'conferencia_iniciada_em', 'conferido_em', 'selecionado_em', 'atribuido_em',
            'conferente', 'conferente_username',
            'sequencia', 'sequencia_numero',
            'separado_por', 'separado_por_nome', 'separador_nao_identificado',
            'qtd_itens', 'qtd_divergencias', 'tempo_espera', 'duracao_conferencia',
        ]

    def get_separado_por_nome(self, obj):
        return _nome_separado_por(obj)

    def get_tempo_espera(self, obj):
        if not obj.criado_em:
            return ''
        delta = timesince(obj.criado_em, now=timezone.now())
        return f'há {delta.split(", ")[0]}'

    def get_duracao_conferencia(self, obj):
        return _formatar_duracao(obj.conferencia_iniciada_em, obj.conferido_em)


class PedidoSerializer(serializers.ModelSerializer):
    itens = PedidoItemSerializer(many=True, read_only=True)
    marketplace_nome = serializers.CharField(source='marketplace.nome', read_only=True)
    conferente_username = serializers.CharField(source='conferente.username', read_only=True)
    separado_por_nome = serializers.SerializerMethodField()
    sequencia_numero = serializers.IntegerField(source='sequencia.numero', read_only=True)
    qtd_divergencias = serializers.SerializerMethodField()
    percent_conferido = serializers.SerializerMethodField()
    qtd_itens = serializers.SerializerMethodField()
    tempo_espera = serializers.SerializerMethodField()
    duracao_conferencia = serializers.SerializerMethodField()

    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_externo', 'marketplace', 'marketplace_nome',
            'cliente', 'status', 'criado_em',
            'conferencia_iniciada_em', 'conferido_em', 'faturado_em',
            'endereco_fisico', 'ordem_pilha',
            'selecionado_em', 'atribuido_em', 'conferente', 'conferente_username',
            'sequencia', 'sequencia_numero',
            'separado_por', 'separado_por_nome', 'separador_nao_identificado',
            'percent_conferido', 'qtd_itens', 'qtd_divergencias',
            'tempo_espera', 'duracao_conferencia',
            'itens',
        ]

    def get_separado_por_nome(self, obj):
        return _nome_separado_por(obj)

    def get_qtd_divergencias(self, obj):
        return DivergenciaBarra.objects.filter(pedido_item__pedido=obj).count()

    def get_percent_conferido(self, obj):
        itens = obj.itens.all()
        total = sum(i.qtd_pedida for i in itens)
        if not total:
            return 0
        return round(sum(i.qtd_separada for i in itens) / total * 100, 1)

    def get_qtd_itens(self, obj):
        return obj.itens.count()

    def get_tempo_espera(self, obj):
        if not obj.criado_em:
            return ''
        delta = timesince(obj.criado_em, now=timezone.now())
        return f'há {delta.split(", ")[0]}'

    def get_duracao_conferencia(self, obj):
        return _formatar_duracao(obj.conferencia_iniciada_em, obj.conferido_em)
