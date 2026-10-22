# Carta de correção (CC-e) — ponto 6 da diretoria, 2026-10-22

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('pedidos', '0014_pedido_codtra_pedido_transportadora'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CartaCorrecao',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('modo', models.CharField(choices=[('dry_run', 'Simulação (dry-run)'), ('gravar', 'Só gravar'), ('gravar_e_transmitir', 'Gravar e transmitir')], max_length=30)),
                ('status', models.CharField(choices=[('simulada', 'Simulada'), ('gravada', 'Gravada (não enviada)'), ('transmitida', 'Transmitida'), ('erro_gravar', 'Erro ao gravar'), ('erro_transmitir', 'Gravada, erro ao transmitir')], max_length=20)),
                ('codtra_anterior', models.CharField(blank=True, max_length=20)),
                ('transportadora_anterior', models.CharField(blank=True, max_length=255)),
                ('codtra_novo', models.CharField(blank=True, max_length=20)),
                ('transportadora_nova', models.CharField(blank=True, max_length=255)),
                ('frete_anterior', models.CharField(blank=True, max_length=1)),
                ('frete_novo', models.CharField(blank=True, max_length=1)),
                ('texto', models.TextField()),
                ('complemento', models.TextField(blank=True)),
                ('cartas_anteriores', models.JSONField(blank=True, default=list)),
                ('payload_gravar', models.JSONField(blank=True, default=dict)),
                ('retorno_gravar', models.JSONField(blank=True, default=dict)),
                ('payload_transmitir', models.JSONField(blank=True, default=dict)),
                ('retorno_transmitir', models.JSONField(blank=True, default=dict)),
                ('erro', models.TextField(blank=True)),
                ('sitdoe', models.IntegerField(blank=True, null=True)),
                ('protocolo', models.CharField(blank=True, max_length=30)),
                ('autorizada_em', models.CharField(blank=True, max_length=20)),
                ('pedido', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cartas_correcao', to='pedidos.pedido')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='cartas_correcao', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Carta de correção',
                'verbose_name_plural': 'Cartas de correção',
                'ordering': ['-criado_em'],
            },
        ),
    ]
