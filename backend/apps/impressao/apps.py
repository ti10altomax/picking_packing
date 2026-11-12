from django.apps import AppConfig


class ImpressaoConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.impressao'
    verbose_name = 'Impressão de etiquetas'

    def ready(self):
        from . import signals  # noqa: F401 — ack do agente USB → ImpressaoEtiqueta
