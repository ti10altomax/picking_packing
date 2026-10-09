from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from unfold.admin import ModelAdmin
from unfold.forms import (
    AdminPasswordChangeForm,
    UserChangeForm as UnfoldUserChangeForm,
    UserCreationForm as UnfoldUserCreationForm,
)
from unfold.contrib.filters.admin import ChoicesDropdownFilter
from unfold.decorators import display

from .models import Configuracao, ErroCliente, ExecucaoTarefa, User


@admin.register(Configuracao)
class ConfiguracaoAdmin(ModelAdmin):
    """Valores válidos (DESIGN.md — Configurações do sistema):

    - liberacao_proxima_sequencia: ao_terminar_meus_pedidos | ao_concluir_sequencia_inteira
    - fechamento_sobra: supervisor_patio | conferente
    """
    list_display = ('chave', 'valor', 'atualizado_em')
    readonly_fields = ('atualizado_em',)


@admin.register(ExecucaoTarefa)
class ExecucaoTarefaAdmin(ModelAdmin):
    """Heartbeat das tarefas Celery — só leitura (quem grava é o decorator)."""
    list_display = ('nome_curto', 'status_badge', 'iniciada_em', 'duracao_ms', 'worker', 'erro_curto')
    list_filter = (('status', ChoicesDropdownFilter), 'tarefa')
    list_filter_submit = True
    search_fields = ('tarefa', 'erro')
    readonly_fields = ('tarefa', 'status', 'iniciada_em', 'terminada_em', 'duracao_ms', 'worker', 'resultado', 'erro')
    date_hierarchy = 'iniciada_em'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(description='Tarefa', ordering='tarefa')
    def nome_curto(self, obj):
        return obj.tarefa.rsplit('.', 1)[-1]

    @display(description='Status', ordering='status', label={'OK': 'success', 'Erro': 'danger', 'Rodando': 'info'})
    def status_badge(self, obj):
        return obj.get_status_display()

    @display(description='Erro')
    def erro_curto(self, obj):
        return (obj.erro or '')[:80]


@admin.register(ErroCliente)
class ErroClienteAdmin(ModelAdmin):
    """Erros do web/coletor — só leitura (quem grava é o POST /api/erros-cliente/)."""
    list_display = ('criado_em', 'origem_badge', 'tela', 'mensagem_curta', 'versao', 'usuario')
    list_filter = (('origem', ChoicesDropdownFilter), 'versao')
    list_filter_submit = True
    search_fields = ('mensagem', 'tela', 'stack', 'usuario__username')
    readonly_fields = ('origem', 'tela', 'mensagem', 'stack', 'versao', 'dispositivo', 'usuario', 'extra', 'criado_em')
    date_hierarchy = 'criado_em'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    @display(description='Origem', ordering='origem', label={'Web': 'info', 'Mobile': 'warning'})
    def origem_badge(self, obj):
        return obj.get_origem_display()

    @display(description='Mensagem')
    def mensagem_curta(self, obj):
        return obj.mensagem[:90]


@admin.register(User)
class CustomUserAdmin(BaseUserAdmin, ModelAdmin):
    """Mistura o UserAdmin nativo com o ModelAdmin do unfold pro visual ficar consistente."""

    # Forms estilizadas pelo unfold (inputs, password change, etc.)
    form = UnfoldUserChangeForm
    add_form = UnfoldUserCreationForm
    change_password_form = AdminPasswordChangeForm

    list_display = ('username', 'nome_completo', 'email', 'perfil_badge', 'is_active', 'is_staff')
    list_filter = (
        ('perfil', ChoicesDropdownFilter),
        'is_active', 'is_staff', 'is_superuser',
    )
    list_filter_submit = True
    search_fields = ('username', 'first_name', 'last_name', 'email')
    ordering = ('username',)

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Informações pessoais', {'fields': ('first_name', 'last_name', 'email')}),
        ('Perfil', {'fields': ('perfil',)}),
        ('Permissões', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',),
        }),
        ('Datas', {'fields': ('last_login', 'date_joined'), 'classes': ('collapse',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'password1', 'password2', 'first_name', 'last_name', 'email', 'perfil'),
        }),
    )

    @display(description="Nome", ordering='first_name')
    def nome_completo(self, obj):
        nome = f"{obj.first_name} {obj.last_name}".strip()
        return nome or "—"

    @display(
        description="Perfil",
        label={
            "Conferente":           "info",
            "Supervisor de Vendas": "warning",
            "Supervisor de Pátio":  "warning",
            "Admin":                "primary",
            "Etiquetador":          "secondary",
        },
    )
    def perfil_badge(self, obj):
        return obj.get_perfil_display()
