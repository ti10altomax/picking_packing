import datetime as dt
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = 'Testa conexão Oracle e sincroniza pedidos do Senior G5'

    def add_arguments(self, parser):
        parser.add_argument(
            '--colunas', action='store_true',
            help='Mostra colunas disponíveis na E120PED e sai',
        )

    def handle(self, *args, **options):
        from apps.senior.oracle import fetch, QUERY_PEDIDOS_PENDENTES
        from apps.pedidos.models import Pedido

        if options['colunas']:
            self.stdout.write('Consultando E120PED (ROWNUM <= 1)...')
            try:
                rows = fetch('SELECT * FROM E120PED WHERE CODEMP = 8 AND ROWNUM <= 1')
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'Erro ao conectar no Oracle: {exc}'))
                return
            if not rows:
                self.stdout.write(self.style.WARNING('Nenhuma linha retornada (E120PED vazia ou CODEMP=8 sem registros)'))
                return
            self.stdout.write(self.style.SUCCESS(f'Colunas ({len(rows[0])}):'))
            for col in rows[0].keys():
                self.stdout.write(f'  {col} = {rows[0][col]!r}')
            return

        self.stdout.write('Buscando pedidos no Oracle...')
        try:
            rows = fetch(QUERY_PEDIDOS_PENDENTES)
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f'Erro ao conectar no Oracle: {exc}'))
            return

        if not rows:
            self.stdout.write(self.style.WARNING('Nenhuma linha retornada'))
            return

        self.stdout.write(f'{len(rows)} linhas recebidas. Colunas: {list(rows[0].keys())}')

        criados = atualizados = ignorados = 0
        for row in rows:
            numero = str(
                row.get('numpedven') or
                row.get('numped') or
                row.get('numpedido') or
                ''
            ).strip()
            if not numero:
                ignorados += 1
                continue

            cliente = str(
                row.get('nomcli') or
                row.get('nomclipdf') or
                row.get('codcli') or
                ''
            ).strip()

            criado_em = row.get('datemi')
            if isinstance(criado_em, dt.datetime) and criado_em.tzinfo is None:
                criado_em = timezone.make_aware(criado_em)
            if not criado_em:
                criado_em = timezone.now()

            pedido, created = Pedido.objects.get_or_create(
                numero_externo=numero,
                defaults={
                    'cliente': cliente,
                    'criado_em': criado_em,
                    'status': Pedido.Status.PENDENTE,
                }
            )
            if created:
                criados += 1
            elif not pedido.cliente and cliente:
                pedido.cliente = cliente
                pedido.save(update_fields=['cliente'])
                atualizados += 1

        msg = f'Resultado: {criados} criados, {atualizados} atualizados'
        if ignorados:
            msg += f', {ignorados} ignorados (sem número de pedido)'
        self.stdout.write(self.style.SUCCESS(msg))
