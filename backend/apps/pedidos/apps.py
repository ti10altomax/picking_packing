from django.apps import AppConfig

class PedidosConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.pedidos'

    def ready(self):
        from . import signals  # noqa: F401 — cotação de frete (2026-11-26)
