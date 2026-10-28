from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from apps.core.views import SeparaTokenView, metrics_protegido
from apps.app_mobile.urls import urlpatterns_apk

urlpatterns = [
    # /admin é do frontend (tela admin do Separa).
    # O admin do Django mora em /django-admin/ pra não colidir.
    path('django-admin/', admin.site.urls),
    # Prometheus (2026-10-08): só de dentro da rede Docker (mp-prometheus); LAN direto em :8003 recebe 403
    path('metrics/', metrics_protegido, name='metrics'),
    path('api/auth/token/', SeparaTokenView.as_view(), name='token_obtain'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('apps.core.urls')),
    path('api/', include('apps.pedidos.urls')),
    path('api/', include('apps.conferencia.urls')),
    path('api/', include('apps.separadores.urls')),
    path('api/', include('apps.sequencias.urls')),
    path('api/', include('apps.senior.urls')),
    path('api/', include('apps.impressao.urls')),
    path('api/', include('apps.carta_correcao.urls')),
    path('api/', include('apps.etiquetas.urls')),
    path('api/', include('apps.app_mobile.urls')),
]

# /apk/ e /apk/separa-X.Y.Z.apk — página e download do app do coletor (fora do /api/,
# URL curta para digitar no navegador do aparelho; o Caddy também manda pro backend)
urlpatterns += urlpatterns_apk
