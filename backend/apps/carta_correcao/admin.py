from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import CartaCorrecao


@admin.register(CartaCorrecao)
class CartaCorrecaoAdmin(ModelAdmin):
    """Só leitura: quem grava é o serviço (rastro dos dois WS do Senior)."""
    list_display = ('criado_em', 'pedido', 'status', 'modo', 'transportadora_anterior', 'transportadora_nova', 'usuario')
    list_filter = ('status', 'modo')
    search_fields = ('pedido__numero_externo', 'pedido__cliente', 'transportadora_nova', 'texto')
    readonly_fields = [f.name for f in CartaCorrecao._meta.fields]

    def has_add_permission(self, request):
        return False
