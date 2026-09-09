from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin, TabularInline
from unfold.contrib.filters.admin import (
    ChoicesDropdownFilter,
    RangeDateFilter,
)
from unfold.decorators import display

from .models import (
    Pedido, PedidoItem, Marketplace, Impressora, Lote,
    PrintAgent, PrintJob, Volume, VolumeItem, PedidoLog,
    Separador, SeparadorLiberacao, Sequencia,
    DivergenciaBarra, ErroSeparacao,
)


# -----------------------------------------------------------------------------
# Pedido — destaque no painel
# -----------------------------------------------------------------------------

# Mapeamento status → cor do badge no estilo "tailwind" do unfold
STATUS_BADGES = {
    "pendente":             ("Pendente",        "warning"),
    "selecionado":          ("Selecionado",     "warning"),
    "atribuido":            ("Atribuído",       "info"),
    "conferindo":           ("Em conferência",  "info"),
    "aguardando_fechamento": ("Aguard. fechamento", "primary"),
    "conferido":            ("Conferido",       "success"),
    "nao_conforme":         ("Não conforme",    "danger"),
    "cancelado":            ("Cancelado",       "secondary"),
    # Estados antigos (escopo congelado) — cinza
    "faturado":             ("Faturado",        "secondary"),
    "aguardando_etiquetar": ("Aguard. etiq.",   "secondary"),
    "concluido":            ("Concluído",       "success"),
}


class PedidoItemInline(TabularInline):
    model = PedidoItem
    extra = 0
    fields = ('sku', 'descricao', 'ean', 'qtd_pedida', 'qtd_separada', 'status')
    readonly_fields = ('sku', 'descricao', 'ean', 'qtd_pedida')
    can_delete = False
    show_change_link = True


@admin.register(Pedido)
class PedidoAdmin(ModelAdmin):
    list_display = (
        'numero_externo', 'tipo', 'frete', 'cliente_curto', 'status_badge',
        'criado_em', 'conferente',
    )
    list_filter = (
        ('status', ChoicesDropdownFilter),
        ('tipo', ChoicesDropdownFilter),
        'frete',
        ('criado_em', RangeDateFilter),
        ('conferente', admin.RelatedOnlyFieldListFilter),
    )
    list_filter_submit = True       # botão "Aplicar" — não recarrega a cada clique
    list_per_page = 50
    search_fields = ('numero_externo', 'cliente')
    date_hierarchy = 'criado_em'
    readonly_fields = (
        'criado_em', 'selecionado_em', 'atribuido_em',
        'conferencia_iniciada_em', 'conferido_em',
        'embalagem_enviada_em', 'embalagem_tentativas', 'embalagem_ultimo_erro',
        'senior_atualizado_em', 'senior_tentativas', 'senior_ultimo_erro',
    )
    inlines = [PedidoItemInline]

    fieldsets = (
        ("Pedido", {
            "fields": (
                "tipo", "numero_externo", "codfil", "codsnf", "frete",
                "cliente", "marketplace", "status",
            ),
        }),
        ("Atribuição", {
            "fields": (
                "selecionado_em", "selecionado_por",
                "sequencia",
                "atribuido_em", "atribuido_por",
                "conferente",
            ),
            "classes": ("tab",),
        }),
        ("Conferência", {
            "fields": (
                "conferencia_iniciada_em", "conferido_em",
                "separado_por", "separador_nao_identificado",
                "endereco_fisico", "ordem_pilha",
            ),
            "classes": ("tab",),
        }),
        ("Não conforme", {
            "fields": ("nao_conforme_em", "nao_conforme_motivo", "nao_conforme_detalhe"),
            "classes": ("tab", "collapse"),
        }),
        ("Senior — escopo atual (volumes)", {
            "fields": ("senior_atualizado_em", "senior_tentativas", "senior_ultimo_erro"),
            "classes": ("tab", "collapse"),
        }),
        ("Senior — escopo antigo (embalagempfa, congelado)", {
            "fields": (
                "embalagem_enviada_em", "embalagem_tentativas", "embalagem_ultimo_erro",
                "etiqueta_impressa_em",
            ),
            "classes": ("tab", "collapse"),
        }),
        ("Datas", {
            "fields": ("criado_em", "faturado_em"),
            "classes": ("tab", "collapse"),
        }),
    )

    @display(description="Cliente", ordering="cliente")
    def cliente_curto(self, obj):
        if not obj.cliente:
            return "—"
        return obj.cliente if len(obj.cliente) <= 35 else obj.cliente[:32] + "…"

    @display(
        description="Status",
        label={
            "Pendente":        "warning",
            "Selecionado":     "warning",
            "Atribuído":       "info",
            "Em conferência":  "info",
            "Aguard. fechamento": "primary",
            "Conferido":       "success",
            "Não conforme":    "danger",
            "Cancelado":       "secondary",
            "Faturado":        "secondary",
            "Aguard. etiq.":   "secondary",
            "Concluído":       "success",
        },
    )
    def status_badge(self, obj):
        label, _ = STATUS_BADGES.get(obj.status, (obj.status, "secondary"))
        return label


# -----------------------------------------------------------------------------
# Volume + items
# -----------------------------------------------------------------------------

class VolumeItemInline(TabularInline):
    model = VolumeItem
    extra = 0
    fields = ('pedido_item', 'qtd', 'criado_em')
    readonly_fields = ('criado_em',)


@admin.register(Volume)
class VolumeAdmin(ModelAdmin):
    list_display = ('id', 'pedido', 'tipo', 'identificador', 'qtd_unidades', 'criado_em', 'fechado_em')
    list_filter = (('tipo', ChoicesDropdownFilter),)
    list_per_page = 50
    search_fields = ('pedido__numero_externo', 'identificador')
    inlines = [VolumeItemInline]
    autocomplete_fields = ('pedido',)
    readonly_fields = ('criado_em', 'criado_por')

    @display(description="Unidades")
    def qtd_unidades(self, obj):
        return sum(i.qtd for i in obj.itens.all())


# -----------------------------------------------------------------------------
# Sequências de separação (DESIGN.md §3)
# -----------------------------------------------------------------------------

@admin.register(Sequencia)
class SequenciaAdmin(ModelAdmin):
    list_display = ('numero', 'status', 'qtd_pedidos', 'criado_em', 'criado_por', 'concluida_em')
    list_filter = (('status', ChoicesDropdownFilter), ('criado_em', RangeDateFilter))
    search_fields = ('numero',)
    readonly_fields = ('criado_em', 'criado_por', 'concluida_em')

    @display(description="Pedidos")
    def qtd_pedidos(self, obj):
        return obj.pedidos.count()


# -----------------------------------------------------------------------------
# Separadores físicos + liberação diária (DESIGN.md §2)
# -----------------------------------------------------------------------------

class SeparadorLiberacaoInline(TabularInline):
    model = SeparadorLiberacao
    extra = 0
    fields = ('data', 'liberado_por', 'criado_em')
    readonly_fields = ('liberado_por', 'criado_em')
    ordering = ('-data',)


@admin.register(Separador)
class SeparadorAdmin(ModelAdmin):
    list_display = ('nome', 'apelido', 'tipo', 'documento', 'ativo', 'user', 'criado_em')
    list_filter = (('tipo', ChoicesDropdownFilter), 'ativo')
    search_fields = ('nome', 'apelido', 'documento')
    autocomplete_fields = ('user',)
    readonly_fields = ('criado_em',)
    inlines = [SeparadorLiberacaoInline]


@admin.register(SeparadorLiberacao)
class SeparadorLiberacaoAdmin(ModelAdmin):
    list_display = ('data', 'separador', 'liberado_por', 'criado_em')
    list_filter = (('data', RangeDateFilter),)
    search_fields = ('separador__nome', 'separador__apelido')
    autocomplete_fields = ('separador',)
    readonly_fields = ('criado_em',)


# -----------------------------------------------------------------------------
# Divergências de barra + erros de separação (DESIGN.md §4)
# -----------------------------------------------------------------------------

@admin.register(DivergenciaBarra)
class DivergenciaBarraAdmin(ModelAdmin):
    list_display = ('criado_em', 'codigo_bipado', 'item_sku', 'qtd', 'vinculado_por', 'observacao')
    list_filter = (('criado_em', RangeDateFilter),)
    search_fields = ('codigo_bipado', 'pedido_item__sku', 'pedido_item__pedido__numero_externo')
    readonly_fields = ('pedido_item', 'codigo_bipado', 'qtd', 'vinculado_por', 'criado_em')

    @display(description="Item")
    def item_sku(self, obj):
        return obj.pedido_item.sku


@admin.register(ErroSeparacao)
class ErroSeparacaoAdmin(ModelAdmin):
    list_display = ('criado_em', 'pedido', 'tipo', 'qtd', 'separador', 'registrado_por')
    list_filter = (('tipo', ChoicesDropdownFilter), ('criado_em', RangeDateFilter),
                   ('separador', admin.RelatedOnlyFieldListFilter))
    search_fields = ('pedido__numero_externo', 'separador__nome', 'separador__apelido')
    readonly_fields = ('pedido', 'pedido_item', 'tipo', 'qtd', 'separador', 'registrado_por', 'criado_em')


# -----------------------------------------------------------------------------
# Logs do pedido (auditoria)
# -----------------------------------------------------------------------------

@admin.register(PedidoLog)
class PedidoLogAdmin(ModelAdmin):
    list_display = ('criado_em', 'pedido', 'acao', 'usuario')
    list_filter = (('acao', ChoicesDropdownFilter), ('criado_em', RangeDateFilter))
    list_filter_submit = True
    search_fields = ('pedido__numero_externo', 'acao', 'usuario__username')
    readonly_fields = ('pedido', 'usuario', 'acao', 'payload', 'criado_em')
    list_per_page = 100

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


# -----------------------------------------------------------------------------
# Marketplace (congelado, mas registrado)
# -----------------------------------------------------------------------------

@admin.register(Marketplace)
class MarketplaceAdmin(ModelAdmin):
    list_display = ('slug', 'nome', 'ativo')
    list_filter = ('ativo',)


# -----------------------------------------------------------------------------
# Etiquetagem — escopo congelado, registros mantidos
# -----------------------------------------------------------------------------

@admin.register(Impressora)
class ImpressoraAdmin(ModelAdmin):
    list_display = ('nome', 'modelo', 'tipo_conexao', 'formato_preferido', 'mesa', 'ativa', 'ultimo_heartbeat')
    list_filter = (('tipo_conexao', ChoicesDropdownFilter), 'ativa')
    search_fields = ('nome', 'modelo', 'mesa')


@admin.register(PrintAgent)
class PrintAgentAdmin(ModelAdmin):
    list_display = ('hostname', 'versao', 'criado_em', 'ultimo_heartbeat')
    readonly_fields = ('token', 'criado_em')
    search_fields = ('hostname',)


@admin.register(PrintJob)
class PrintJobAdmin(ModelAdmin):
    list_display = ('id', 'impressora', 'status', 'criado_em', 'retirado_em')
    list_filter = (('status', ChoicesDropdownFilter), 'impressora')


@admin.register(Lote)
class LoteAdmin(ModelAdmin):
    list_display = ('id', 'etiquetador', 'mesa', 'qtd_pedidos', 'criado_em', 'finalizado_em')
    list_filter = ('mesa',)
