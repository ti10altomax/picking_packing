from rest_framework import serializers
from django.utils import timezone
from django.utils.timesince import timesince
from .models import Pedido, PedidoItem


class PedidoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PedidoItem
        fields = ['id', 'sku', 'descricao', 'ean', 'qtd_pedida', 'qtd_separada', 'status']


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
    tempo_espera = serializers.SerializerMethodField()
    duracao_separacao = serializers.SerializerMethodField()
    separador_username = serializers.CharField(source='separador.username', read_only=True)

    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_externo', 'cliente', 'status', 'criado_em',
            'separacao_iniciada_em', 'separado_em', 'selecionado_em', 'atribuido_em',
            'separador', 'separador_username',
            'qtd_itens', 'tempo_espera', 'duracao_separacao',
        ]

    def get_tempo_espera(self, obj):
        if not obj.criado_em:
            return ''
        delta = timesince(obj.criado_em, now=timezone.now())
        return f'há {delta.split(", ")[0]}'

    def get_duracao_separacao(self, obj):
        return _formatar_duracao(obj.separacao_iniciada_em, obj.separado_em)


class PedidoSerializer(serializers.ModelSerializer):
    itens = PedidoItemSerializer(many=True, read_only=True)
    marketplace_nome = serializers.CharField(source='marketplace.nome', read_only=True)
    separador_username = serializers.CharField(source='separador.username', read_only=True)
    percent_separado = serializers.SerializerMethodField()
    qtd_itens = serializers.SerializerMethodField()
    tempo_espera = serializers.SerializerMethodField()
    duracao_separacao = serializers.SerializerMethodField()

    class Meta:
        model = Pedido
        fields = [
            'id', 'numero_externo', 'marketplace', 'marketplace_nome',
            'cliente', 'status', 'criado_em',
            'separacao_iniciada_em', 'separado_em', 'faturado_em',
            'endereco_fisico', 'ordem_pilha',
            'selecionado_em', 'atribuido_em', 'separador', 'separador_username',
            'percent_separado', 'qtd_itens', 'tempo_espera', 'duracao_separacao',
            'itens',
        ]

    def get_percent_separado(self, obj):
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

    def get_duracao_separacao(self, obj):
        return _formatar_duracao(obj.separacao_iniciada_em, obj.separado_em)
