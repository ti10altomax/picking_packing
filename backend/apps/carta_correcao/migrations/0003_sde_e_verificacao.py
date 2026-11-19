# Carta "aguardando transmissão (SDE)" + verificação na E140CCE (2026-11-19): o retorno 10011 do
# EmitirCartaCorrecao ("verifique o log do SDE") não é final — a carta fica gravada e sai depois.
# O Separa passa a reler a E140CCE e a guardar a sequência/situação que o Senior tem.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('carta_correcao', '0002_nf_e_volumes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='cartacorrecao',
            name='status',
            field=models.CharField(choices=[
                ('simulada', 'Simulada'),
                ('gravada', 'Gravada (não enviada)'),
                ('aguardando_sde', 'Gravada, aguardando transmissão (SDE)'),
                ('transmitida', 'Transmitida'),
                ('erro_gravar', 'Erro ao gravar'),
                ('erro_transmitir', 'Gravada, erro ao transmitir'),
            ], max_length=20),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='seqeve',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='sitcce_senior',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='cartacorrecao',
            name='verificada_em',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
