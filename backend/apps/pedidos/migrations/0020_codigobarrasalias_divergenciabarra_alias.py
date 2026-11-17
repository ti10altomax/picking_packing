# Código de barras alternativo (2026-11-17): etiqueta impressa errada na fábrica, em série,
# aceita como o EAN certo do Senior; cada bip continua virando DivergenciaBarra (com `alias`)
# para a cobrança da fábrica.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0019_pedido_nf_chave_nf_volumes'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CodigoBarrasAlias',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo_lido', models.CharField(help_text='O que a etiqueta da peça tem impresso e o coletor lê.', max_length=100, unique=True, verbose_name='código lido (errado)')),
                ('codigo_certo', models.CharField(db_index=True, help_text='O código de barras cadastrado no Senior para o produto — o EAN que aparece no item do documento.', max_length=100, verbose_name='código certo (EAN do Senior)')),
                ('ativo', models.BooleanField(default=True, help_text='Desligue quando a fábrica corrigir a etiqueta.')),
                ('observacao', models.TextField(blank=True, help_text='Produto, desde quando vem errado, quem informou.')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('atualizado_em', models.DateTimeField(auto_now=True)),
                ('criado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='aliases_barra_criados', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Código de barras alternativo',
                'verbose_name_plural': 'Códigos de barras alternativos',
                'ordering': ['-ativo', 'codigo_certo'],
            },
        ),
        migrations.AddField(
            model_name='divergenciabarra',
            name='alias',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='divergencias', to='pedidos.codigobarrasalias'),
        ),
    ]
