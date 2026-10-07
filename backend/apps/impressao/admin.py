from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import ImpressaoEtiqueta


@admin.register(ImpressaoEtiqueta)
class ImpressaoEtiquetaAdmin(ModelAdmin):
    list_display = ('criado_em', 'pedido', 'canal', 'impressora', 'status', 'qtd_etiquetas', 'automatica', 'usuario')
    list_filter = ('canal', 'status', 'automatica')
    search_fields = ('pedido__numero_externo', 'pedido__cliente')
    readonly_fields = ('criado_em',)
    autocomplete_fields = ()
