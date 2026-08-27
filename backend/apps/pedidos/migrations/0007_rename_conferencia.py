# Rename do redesenho 2026-08 (ver DESIGN.md): o "separador" do sistema vira "conferente".
# Campos, status e valores no banco migram juntos; campos/status do escopo congelado ficam.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def status_para_conferencia(apps, schema_editor):
    Pedido = apps.get_model('pedidos', 'Pedido')
    Pedido.objects.filter(status='separando').update(status='conferindo')
    Pedido.objects.filter(status='separado').update(status='conferido')


def status_para_separacao(apps, schema_editor):
    Pedido = apps.get_model('pedidos', 'Pedido')
    Pedido.objects.filter(status='conferindo').update(status='separando')
    Pedido.objects.filter(status='conferido').update(status='separado')


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pedidos', '0006_pedidoitem_chave_senior'),
    ]

    operations = [
        migrations.RenameField(
            model_name='pedido',
            old_name='separador',
            new_name='conferente',
        ),
        migrations.RenameField(
            model_name='pedido',
            old_name='separacao_iniciada_em',
            new_name='conferencia_iniciada_em',
        ),
        migrations.RenameField(
            model_name='pedido',
            old_name='separado_em',
            new_name='conferido_em',
        ),
        migrations.AlterField(
            model_name='pedido',
            name='conferente',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='pedidos_conferidos',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='pedido',
            name='status',
            field=models.CharField(
                choices=[
                    ('pendente', 'Pendente'),
                    ('selecionado', 'Selecionado'),
                    ('atribuido', 'Atribuído'),
                    ('conferindo', 'Em conferência'),
                    ('conferido', 'Conferido'),
                    ('nao_conforme', 'Não conforme'),
                    ('cancelado', 'Cancelado'),
                    ('faturado', 'Faturado'),
                    ('aguardando_etiquetar', 'Aguardando etiquetar'),
                    ('concluido', 'Concluído'),
                ],
                default='pendente',
                max_length=30,
            ),
        ),
        migrations.RunPython(status_para_conferencia, status_para_separacao),
    ]
