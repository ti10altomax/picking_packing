from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Testa conexão Oracle e sincroniza pedidos do Senior G5'

    def add_arguments(self, parser):
        parser.add_argument(
            '--colunas', action='store_true',
            help='Mostra colunas disponíveis na E120PED e sai',
        )

    def handle(self, *args, **options):
        from apps.senior.oracle import fetch

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

        # Mesma rotina do Celery Beat (pedidos + NFs sem pedido de origem), síncrona.
        from apps.senior.tasks import sincronizar_pedidos_oracle

        self.stdout.write('Sincronizando pedidos e notas fiscais do Oracle...')
        resultado = sincronizar_pedidos_oracle()
        for chave, valor in resultado.items():
            if isinstance(valor, dict) and 'erro' in valor:
                self.stderr.write(self.style.ERROR(f'{chave}: {valor["erro"]}'))
            else:
                self.stdout.write(self.style.SUCCESS(f'{chave}: {valor}'))
