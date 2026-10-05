# Transportadora do documento (ponto 3 da diretoria, 2026-10-05)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0013_pedido_cancelado_em_pedido_cancelado_origem_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='codtra',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='pedido',
            name='transportadora',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
