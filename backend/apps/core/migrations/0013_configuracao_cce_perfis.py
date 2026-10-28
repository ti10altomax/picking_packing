# Quem pode fazer carta de correção — chave cce_perfis em Configuracao (2026-10-28).
# Só editável no Django Admin de propósito (um supervisor não se libera sozinho).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_configuracao_cce_texto'),
    ]

    operations = [
        migrations.AlterField(
            model_name='configuracao',
            name='chave',
            field=models.CharField(choices=[('liberacao_proxima_sequencia', 'Liberação da próxima sequência'), ('fechamento_sobra', 'Fechamento de pedido com sobra'), ('janela_sync_dias', 'Janela do sync Senior (dias)'), ('impressora_padrao', 'Impressora padrão das etiquetas de volume'), ('etiqueta_automatica', 'Imprimir etiqueta de volume ao concluir'), ('etiqueta_modelo', 'Modelo da etiqueta de volume'), ('etiqueta_exige_nf', 'Etiqueta de volume só com NF emitida'), ('cce_modo', 'Carta de correção: modo'), ('cce_tipger', 'Carta de correção: tipo de geração (tipGer)'), ('cce_texto', 'Carta de correção: texto (montado | livre)'), ('cce_perfis', 'Carta de correção: perfis que podem corrigir')], max_length=50, unique=True),
        ),
    ]
