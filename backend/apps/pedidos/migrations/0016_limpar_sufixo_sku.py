"""Tira o sufixo '-<codemp>' do SKU dos itens (2026-10-26).

O sync montava `sku = codpro-codder-codemp` desde o primeiro commit (ideia da época do
marketplace, com mais de uma empresa). A empresa já fica no campo `codemp`, e o '-1' só
atrapalhava na etiqueta (modelo compacto mostra só o SKU) e na bipagem por SKU. Limpa
tudo que existe para a comparação de itens (transferência de conferência) e o relatório
por sequência continuarem agrupando certo entre documentos antigos e novos.
"""
from django.db import migrations

CODEMP = 1  # apps.senior.oracle.SENIOR_CODEMP na data da migration


def limpar(apps, schema_editor):
    PedidoItem = apps.get_model('pedidos', 'PedidoItem')
    sufixo = f'-{CODEMP}'
    alterar = []
    for item in PedidoItem.objects.filter(sku__endswith=sufixo).only('id', 'sku', 'codpro', 'codder').iterator(chunk_size=2000):
        # Com codpro gravado, só mexe se o sku for exatamente codpro-codder-codemp.
        if item.codpro and item.sku != f'{item.codpro}-{item.codder}{sufixo}':
            continue
        item.sku = item.sku[: -len(sufixo)]
        alterar.append(item)
        if len(alterar) >= 2000:
            PedidoItem.objects.bulk_update(alterar, ['sku'])
            alterar = []
    if alterar:
        PedidoItem.objects.bulk_update(alterar, ['sku'])


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0015_pedido_nf_vinculo'),
    ]

    operations = [
        migrations.RunPython(limpar, migrations.RunPython.noop),
    ]
