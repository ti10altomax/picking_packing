"""Preenche as medidas (E075DER.COMDER/LARDER/ALTDER) dos itens importados sem elas.

O sync grava as medidas desde 2026-11-23 (estimativa de caixas na conferência); este
comando corrige o que já estava no banco. Rodar uma vez depois do deploy:

    python manage.py preencher_medidas_itens            # documentos em andamento
    python manage.py preencher_medidas_itens --todos    # inclusive Conferidos/antigos
"""
import re

from django.core.management.base import BaseCommand

from apps.pedidos.models import Pedido, PedidoItem
from apps.senior.oracle import QUERY_DERIVACOES, fetch
from apps.senior.tasks import medidas

EM_ANDAMENTO = (
    Pedido.Status.PENDENTE, Pedido.Status.SELECIONADO, Pedido.Status.ATRIBUIDO,
    Pedido.Status.CONFERINDO, Pedido.Status.NAO_CONFORME,
)
LOTE = 500


class Command(BaseCommand):
    help = 'Preenche PedidoItem.comprimento/largura/altura vazios a partir da E075DER'

    def add_arguments(self, parser):
        parser.add_argument('--todos', action='store_true', help='inclui documentos concluídos')

    def handle(self, *args, todos=False, **opts):
        itens = PedidoItem.objects.filter(comprimento__isnull=True).exclude(codpro='')
        if not todos:
            itens = itens.filter(pedido__status__in=EM_ANDAMENTO)
        produtos = sorted(set(itens.values_list('codpro', flat=True)))
        self.stdout.write(f'{itens.count()} itens sem medida em {len(produtos)} produtos')

        derivacoes: dict[tuple[str, str], dict] = {}
        for i in range(0, len(produtos), LOTE):
            lote = produtos[i:i + LOTE]
            sql = QUERY_DERIVACOES.format(marcadores=', '.join(f':{n + 1}' for n in range(len(lote))))
            for r in fetch(sql, lote):
                derivacoes[(str(r['codpro']).strip(), str(r['codder']).strip())] = r

        atualizados = 0
        for item in itens.only('id', 'codpro', 'codder'):
            proprio = derivacoes.get((item.codpro, item.codder), {})
            base = derivacoes.get((item.codpro, re.sub(r'\d+$', '', item.codder)), {})
            c, l, a = medidas(proprio, base=base)
            if c:
                PedidoItem.objects.filter(pk=item.pk).update(comprimento=c, largura=l, altura=a)
                atualizados += 1
        self.stdout.write(self.style.SUCCESS(f'{atualizados} itens atualizados'))
