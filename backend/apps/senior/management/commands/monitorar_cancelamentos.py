from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Roda a checagem de cancelamento no Senior (sitPed=5 / sitNfv=9) uma vez, '
        'síncrona. Com --completa inclui os Pendentes fora da janela do sync — '
        'usar após o deploy para limpar o acumulado.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--completa', action='store_true', help='inclui Pendentes fora da janela')

    def handle(self, *args, **options):
        from apps.senior.tasks import monitorar_cancelamentos

        resultado = monitorar_cancelamentos(passada_completa=options['completa'])
        self.stdout.write(self.style.SUCCESS(str(resultado)))
