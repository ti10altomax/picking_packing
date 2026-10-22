# CC-e em nota que nasceu de pedido (nf_*) + correção da quantidade de volumes (qtdEmb) — 2026-10-22

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('carta_correcao', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='cartacorrecao',
            name='nf_codfil',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='nf_codsnf',
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='nf_numero',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='volumes_anterior',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='volumes_novo',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
