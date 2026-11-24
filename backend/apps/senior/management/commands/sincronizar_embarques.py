from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = (
        'Lê os embarques do Senior (E145EBQ/E145NFV) uma vez, síncrono, e leva para Embarcado '
        'os documentos cuja nota já embarcou. --dias alarga a janela (o beat usa 30); '
        '--simular mostra o que mudaria e desfaz tudo no fim.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dias', type=int, default=None, help='janela em dias sobre a geração do embarque')
        parser.add_argument('--simular', action='store_true', help='não grava nada (transação desfeita)')

    def handle(self, *args, **options):
        from apps.senior.tasks import sincronizar_embarques

        if not options['simular']:
            self.stdout.write(self.style.SUCCESS(str(sincronizar_embarques(dias=options['dias']))))
            return
        from apps.senior.oracle import QUERY_EMBARQUES_RECENTES, fetch
        from apps.senior.tasks import EMBARQUE_JANELA_DIAS
        from apps.pedidos import embarque

        rows = fetch(QUERY_EMBARQUES_RECENTES, [options['dias'] or EMBARQUE_JANELA_DIAS])
        with transaction.atomic():
            resultado = embarque.sincronizar(rows)   # sem `consultar_notas`: a simulação não desfaz nada
            transaction.set_rollback(True)
        self.stdout.write(self.style.WARNING(f'SIMULAÇÃO (nada gravado): {resultado}'))
