from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import CartaCorrecao


@admin.register(CartaCorrecao)
class CartaCorrecaoAdmin(ModelAdmin):
    """Só leitura, exceto `status` (2026-11-19): carta com transmissão incerta (aguardando SDE / erro)
    que o fiscal confirmou que NÃO chegou à SEFAZ pode ser marcada como "Erro ao gravar" para o
    Separa deixar de considerá-la. Quem grava o resto é o serviço (rastro dos dois WS do Senior)."""
    list_display = ('criado_em', 'pedido', 'nf_numero', 'status', 'modo', 'transportadora_anterior', 'transportadora_nova',
                    'volumes_anterior', 'volumes_novo', 'usuario')
    list_filter = ('status', 'modo')
    search_fields = ('pedido__numero_externo', 'nf_numero', 'pedido__cliente', 'transportadora_nova', 'texto')
    readonly_fields = [f.name for f in CartaCorrecao._meta.fields if f.name != 'status']

    def has_add_permission(self, request):
        return False
