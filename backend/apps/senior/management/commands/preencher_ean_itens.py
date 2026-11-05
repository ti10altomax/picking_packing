"""Preenche o código de barras dos itens que entraram sem ele.

Até 2026-11-05 o sync gravava só o CODBAR da derivação, e derivações como G1/G2/G60 têm
CODBAR = 0 — o item ficava sem EAN e bipar o produto não achava. O sync novo já grava o
código efetivo (CODBAR → CODGTN → CODBAR do tamanho base); este comando corrige o que já
estava no banco. Rodar uma vez depois do deploy:

    python manage.py preencher_ean_itens            # documentos em andamento
    python manage.py preencher_ean_itens --todos    # inclusive Conferidos/antigos
"""
import re

from django.core.management.base import BaseCommand
from django.db.models import Q

from apps.pedidos.models import Pedido, PedidoItem
from apps.senior.oracle import QUERY_DERIVACOES, fetch
from apps.senior.tasks import codigo_barras

EM_ANDAMENTO = (
    Pedido.Status.PENDENTE, Pedido.Status.SELECIONADO, Pedido.Status.ATRIBUIDO,
    Pedido.Status.CONFERINDO, Pedido.Status.NAO_CONFORME,
)
LOTE = 500


class Command(BaseCommand):
    help = 'Preenche PedidoItem.ean vazio com CODBAR → CODGTN → CODBAR do tamanho base (E075DER)'

    def add_arguments(self, parser):
        parser.add_argument('--todos', action='store_true', help='inclui documentos concluídos')

    def handle(self, *args, todos=False, **opts):
        itens = PedidoItem.objects.filter(Q(ean='') | Q(ean='0')).exclude(codpro='')
        if not todos:
            itens = itens.filter(pedido__status__in=EM_ANDAMENTO)
        produtos = sorted(set(itens.values_list('codpro', flat=True)))
        self.stdout.write(f'{itens.count()} itens sem código em {len(produtos)} produtos')

        derivacoes: dict[tuple[str, str], tuple] = {}
        for i in range(0, len(produtos), LOTE):
            lote = produtos[i:i + LOTE]
            sql = QUERY_DERIVACOES.format(marcadores=', '.join(f':{n + 1}' for n in range(len(lote))))
            for r in fetch(sql, lote):
                chave = (str(r['codpro']).strip(), str(r['codder']).strip())
                derivacoes[chave] = (r.get('codbar'), r.get('codgtn'))

        atualizados = 0
        for item in itens.only('id', 'codpro', 'codder'):
            proprio = derivacoes.get((item.codpro, item.codder), (None, None))
            base = derivacoes.get((item.codpro, re.sub(r'\d+$', '', item.codder)), (None, None))
            ean = codigo_barras(proprio[0], proprio[1], base[0])
            if ean:
                PedidoItem.objects.filter(pk=item.pk).update(ean=ean[:20])
                atualizados += 1
        self.stdout.write(self.style.SUCCESS(f'{atualizados} itens atualizados'))
