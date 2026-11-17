# Descrição livre da sequência (2026-11-17): o Pátio escreve o nome da aba da planilha
# que usa em paralelo, até o Separa ser o único controle.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0020_codigobarrasalias_divergenciabarra_alias'),
    ]

    operations = [
        migrations.AddField(
            model_name='sequencia',
            name='descricao',
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
