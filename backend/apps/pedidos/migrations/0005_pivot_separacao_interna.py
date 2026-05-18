import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


STATUS_CHOICES = [
    ('pendente', 'Pendente'),
    ('selecionado', 'Selecionado'),
    ('atribuido', 'Atribuído'),
    ('separando', 'Em separação'),
    ('separado', 'Separado'),
    ('nao_conforme', 'Não conforme'),
    ('cancelado', 'Cancelado'),
    ('faturado', 'Faturado'),
    ('aguardando_etiquetar', 'Aguardando etiquetar'),
    ('concluido', 'Concluído'),
]

MOTIVO_CHOICES = [
    ('divergencia_qtd', 'Divergência de quantidade'),
    ('produto_errado', 'Produto errado'),
    ('item_ausente', 'Item ausente'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0004_printagent_printjob'),
        ('core', '0002_alter_user_perfil'),
    ]

    operations = [
        # Status do Pedido — estende choices
        migrations.AlterField(
            model_name='pedido',
            name='status',
            field=models.CharField(choices=STATUS_CHOICES, default='pendente', max_length=30),
        ),

        # Campos novos do fluxo de seleção / atribuição
        migrations.AddField(
            model_name='pedido',
            name='selecionado_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pedido',
            name='selecionado_por',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='pedidos_selecionados',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='pedido',
            name='atribuido_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pedido',
            name='atribuido_por',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='pedidos_atribuidos',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='pedido',
            name='separacao_iniciada_em',
            field=models.DateTimeField(blank=True, null=True),
        ),

        # Não conforme
        migrations.AddField(
            model_name='pedido',
            name='nao_conforme_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nao_conforme_motivo',
            field=models.CharField(blank=True, choices=MOTIVO_CHOICES, max_length=30),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nao_conforme_detalhe',
            field=models.TextField(blank=True),
        ),

        # Senior — atualização pós-separação (WS a definir)
        migrations.AddField(
            model_name='pedido',
            name='senior_atualizado_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='pedido',
            name='senior_tentativas',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='pedido',
            name='senior_ultimo_erro',
            field=models.TextField(blank=True),
        ),

        # Volume e VolumeItem
        migrations.CreateModel(
            name='Volume',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo', models.CharField(
                    choices=[('caixa', 'Caixa'), ('fardo', 'Fardo'), ('outro', 'Outro')],
                    max_length=20,
                )),
                ('identificador', models.CharField(blank=True, max_length=100)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('fechado_em', models.DateTimeField(blank=True, null=True)),
                ('pedido', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='volumes',
                    to='pedidos.pedido',
                )),
                ('criado_por', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='volumes_criados',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['criado_em']},
        ),
        migrations.CreateModel(
            name='VolumeItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qtd', models.IntegerField()),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('pedido_item', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='alocacoes',
                    to='pedidos.pedidoitem',
                )),
                ('volume', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='itens',
                    to='pedidos.volume',
                )),
            ],
            options={'ordering': ['criado_em']},
        ),
    ]
