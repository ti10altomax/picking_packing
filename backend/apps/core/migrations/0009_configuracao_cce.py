# Carta de correção (CC-e) — chaves cce_modo / cce_tipger em Configuracao (2026-10-22)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_errocliente'),
    ]

    operations = [
        migrations.AlterField(
            model_name='configuracao',
            name='chave',
            field=models.CharField(choices=[('liberacao_proxima_sequencia', 'Liberação da próxima sequência'), ('fechamento_sobra', 'Fechamento de pedido com sobra'), ('janela_sync_dias', 'Janela do sync Senior (dias)'), ('impressora_padrao', 'Impressora padrão das etiquetas de volume'), ('etiqueta_automatica', 'Imprimir etiqueta de volume ao concluir'), ('cce_modo', 'Carta de correção: modo'), ('cce_tipger', 'Carta de correção: tipo de geração (tipGer)')], max_length=50, unique=True),
        ),
    ]
