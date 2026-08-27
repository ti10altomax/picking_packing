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

from .models import Configuracao, User


@admin.register(Configuracao)
class ConfiguracaoAdmin(ModelAdmin):
    """Valores válidos (DESIGN.md — Configurações do sistema):

    - liberacao_proxima_sequencia: ao_terminar_meus_pedidos | ao_concluir_sequencia_inteira
    - fechamento_sobra: supervisor_patio | conferente
    """
    list_display = ('chave', 'valor', 'atualizado_em')
    readonly_fields = ('atualizado_em',)


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
