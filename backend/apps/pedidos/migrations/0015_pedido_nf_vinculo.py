# Vínculo pedido → NF emitida (carta de correção em nota que nasceu de pedido) — 2026-10-22

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0014_pedido_codtra_pedido_transportadora'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='nf_codfil',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nf_codsnf',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nf_numero',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nf_vinculada_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
