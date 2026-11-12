from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import ImpressaoEtiqueta, VersaoAgente


@admin.register(ImpressaoEtiqueta)
class ImpressaoEtiquetaAdmin(ModelAdmin):
    list_display = ('criado_em', 'pedido', 'canal', 'impressora', 'status', 'qtd_etiquetas', 'automatica', 'usuario')
    list_filter = ('canal', 'status', 'automatica')
    search_fields = ('pedido__numero_externo', 'pedido__cliente')
    readonly_fields = ('criado_em',)
    autocomplete_fields = ()


@admin.register(VersaoAgente)
class VersaoAgenteAdmin(ModelAdmin):
    """Publicar pelo Separa (Admin → Agente de impressão) é o caminho normal — aqui é
    para consulta e para apagar uma versão errada."""
    list_display = ('versao', 'tamanho_bytes', 'criado_em', 'criado_por')
    readonly_fields = ('tamanho_bytes', 'sha256', 'criado_em', 'criado_por')
