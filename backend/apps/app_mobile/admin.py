from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import DispositivoApp, VersaoApp


@admin.register(VersaoApp)
class VersaoAppAdmin(ModelAdmin):
    """Publicar pelo Separa (Admin → App do coletor) é o caminho normal — aqui é
    para consulta e para apagar uma versão errada."""
    list_display = ('versao', 'version_code', 'obrigatoria', 'tamanho_bytes', 'criado_em', 'criado_por')
    readonly_fields = ('tamanho_bytes', 'sha256', 'criado_em', 'criado_por')


@admin.register(DispositivoApp)
class DispositivoAppAdmin(ModelAdmin):
    list_display = ('usuario', 'dispositivo', 'versao', 'ultimo_acesso_em')
    search_fields = ('usuario__username', 'dispositivo', 'versao')
    readonly_fields = ('ultimo_acesso_em',)
