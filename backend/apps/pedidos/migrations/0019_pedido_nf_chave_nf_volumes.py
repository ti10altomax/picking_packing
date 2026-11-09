# Chave do DANFE e quantidade de volumes da NF no documento (2026-11-09): a etiqueta de
# volume passa a imprimir a chave de acesso no código de barras e só sai quando os volumes
# do Separa batem com os da nota (senão, carta de correção antes).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0018_volume_op'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedido',
            name='nf_chave',
            field=models.CharField(blank=True, max_length=44),
        ),
        migrations.AddField(
            model_name='pedido',
            name='nf_volumes',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
