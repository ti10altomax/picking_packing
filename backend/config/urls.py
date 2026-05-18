from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from apps.core.views import SeparaTokenView

urlpatterns = [
    # /admin é do frontend (tela admin do Separa).
    # O admin do Django mora em /django-admin/ pra não colidir.
    path('django-admin/', admin.site.urls),
    path('api/auth/token/', SeparaTokenView.as_view(), name='token_obtain'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/', include('apps.core.urls')),
    path('api/', include('apps.pedidos.urls')),
    path('api/', include('apps.separacao.urls')),
    path('api/', include('apps.senior.urls')),
    path('api/', include('apps.etiquetas.urls')),
]
