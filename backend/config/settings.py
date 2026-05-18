from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('DJANGO_SECRET_KEY')
DEBUG = config('DJANGO_DEBUG', default=False, cast=bool)
if DEBUG:
    # Em dev: aceita qualquer host (LAN, celular, etc.)
    ALLOWED_HOSTS = ['*']
else:
    ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='localhost').split(',')

INSTALLED_APPS = [
    # Unfold tem que vir ANTES de django.contrib.admin pra sobrescrever templates
    'unfold',
    'unfold.contrib.filters',       # filtros visuais melhorados
    'unfold.contrib.forms',          # widgets de form com cara melhor
    'unfold.contrib.inlines',        # inlines com tabs (opcional)
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'channels',
    'django_celery_beat',
    # Local
    'apps.core',
    'apps.pedidos',
    'apps.separacao',
    'apps.senior',
    'apps.vtex',
    'apps.etiquetas',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise serve os arquivos de STATIC_ROOT em produção sem precisar
    # de nginx; em dev (DEBUG=True) o Django serve sozinho como sempre.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('POSTGRES_DB', default='separa'),
        'USER': config('POSTGRES_USER', default='separa'),
        'PASSWORD': config('POSTGRES_PASSWORD'),
        'HOST': config('POSTGRES_HOST', default='postgres'),
        'PORT': config('POSTGRES_PORT', default='5432'),
    }
}

AUTH_USER_MODEL = 'core.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=config('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', default=60, cast=int)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=config('JWT_REFRESH_TOKEN_LIFETIME_DAYS', default=7, cast=int)),
}

if DEBUG:
    # Em dev: aceita qualquer origin (LAN, celular, etc.)
    CORS_ALLOW_ALL_ORIGINS = True
    CSRF_TRUSTED_ORIGINS = []
else:
    CORS_ALLOWED_ORIGINS = config(
        'CORS_ALLOWED_ORIGINS',
        default='http://localhost:3000',
    ).split(',')
    # CSRF — Django admin (session auth) exige a origin na lista quando
    # atrás de reverse proxy. Reusa a mesma lista do CORS.
    CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# Atrás do Caddy (HTTPS): backend recebe HTTP mas o cliente fala HTTPS.
# Esses dois settings dizem ao Django que pode confiar nos headers do proxy.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {'hosts': [config('REDIS_URL', default='redis://redis:6379/0')]},
    }
}

CELERY_BROKER_URL = config('REDIS_URL', default='redis://redis:6379/0')
CELERY_RESULT_BACKEND = config('REDIS_URL', default='redis://redis:6379/0')

CELERY_BEAT_SCHEDULE = {
    'sincronizar-pedidos-oracle': {
        'task': 'apps.senior.tasks.sincronizar_pedidos_oracle',
        'schedule': 120.0,  # a cada 2 minutos — importa sitPed=1 como Pendente (CODEMP=1)
    },
    # CONGELADO — escopo antigo (Senior+CLICK+VTEX). Códigos preservados em apps/senior/tasks.py
    # e apps/vtex/tasks.py. Reativar removendo o comentário se voltar ao fluxo de marketplace.
    # 'monitorar-faturamento': {
    #     'task': 'apps.senior.tasks.monitorar_faturamento',
    #     'schedule': 120.0,
    # },
    # 'resgatar-etiquetas-vtex': {
    #     'task': 'apps.vtex.tasks.resgatar_etiquetas_pendentes',
    #     'schedule': 60.0,
    # },
}

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# WhiteNoise: comprime e adiciona hash ao nome do arquivo (cache eterno seguro)
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Unfold — estilo do Django admin (Tailwind, dark mode auto, sidebar moderna)
# ---------------------------------------------------------------------------
UNFOLD = {
    "SITE_TITLE": "Separa — Admin",
    "SITE_HEADER": "Separa",
    "SITE_SUBHEADER": "Painel administrativo",
    "SITE_URL": "/",
    "SITE_SYMBOL": "warehouse",  # ícone do Material Icons no header
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "THEME": None,  # None = segue preferência do navegador (light/dark auto)
    "BORDER_RADIUS": "8px",
    "COLORS": {
        # Paleta zinc do Tailwind — combina com o frontend
        "base": {
            "50": "250 250 250",
            "100": "244 244 245",
            "200": "228 228 231",
            "300": "212 212 216",
            "400": "161 161 170",
            "500": "113 113 122",
            "600": "82 82 91",
            "700": "63 63 70",
            "800": "39 39 42",
            "900": "24 24 27",
            "950": "9 9 11",
        },
        "primary": {
            "50": "239 246 255",
            "100": "219 234 254",
            "200": "191 219 254",
            "300": "147 197 253",
            "400": "96 165 250",
            "500": "59 130 246",
            "600": "37 99 235",
            "700": "29 78 216",
            "800": "30 64 175",
            "900": "30 58 138",
            "950": "23 37 84",
        },
    },
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "Operação",
                "separator": True,
                "items": [
                    {
                        "title": "Pedidos",
                        "icon": "receipt_long",
                        "link": "/django-admin/pedidos/pedido/",
                    },
                    {
                        "title": "Volumes",
                        "icon": "inventory_2",
                        "link": "/django-admin/pedidos/volume/",
                    },
                ],
            },
            {
                "title": "Cadastros",
                "separator": True,
                "items": [
                    {
                        "title": "Usuários",
                        "icon": "person",
                        "link": "/django-admin/core/user/",
                    },
                    {
                        "title": "Marketplaces (congelado)",
                        "icon": "storefront",
                        "link": "/django-admin/pedidos/marketplace/",
                    },
                ],
            },
            {
                "title": "Etiquetagem (congelado)",
                "separator": True,
                "items": [
                    {"title": "Impressoras", "icon": "print", "link": "/django-admin/pedidos/impressora/"},
                    {"title": "Lotes", "icon": "inventory_2", "link": "/django-admin/pedidos/lote/"},
                    {"title": "Print Agents", "icon": "dns", "link": "/django-admin/pedidos/printagent/"},
                    {"title": "Print Jobs", "icon": "task", "link": "/django-admin/pedidos/printjob/"},
                ],
            },
            {
                "title": "Sistema",
                "separator": True,
                "items": [
                    {
                        "title": "Tarefas Celery",
                        "icon": "schedule",
                        "link": "/django-admin/django_celery_beat/periodictask/",
                    },
                    {
                        "title": "Logs de pedidos",
                        "icon": "history",
                        "link": "/django-admin/pedidos/pedidolog/",
                    },
                ],
            },
        ],
    },
}

# Oracle Senior (used by apps/senior/oracle.py directly, not Django ORM)
ORACLE_USER = config('ORACLE_USER')
ORACLE_PASSWORD = config('ORACLE_PASSWORD')
ORACLE_HOST = config('ORACLE_HOST')
ORACLE_PORT = config('ORACLE_PORT', default='1521')
ORACLE_DB = config('ORACLE_DB')
ORACLE_SCHEMA = config('ORACLE_SCHEMA', default='ERP_PROD')
ORACLE_CLIENT_LIB = config('ORACLE_CLIENT_LIB', default='')

# Senior SOAP
SENIOR_WSDL_EMBALAGEM = config('SENIOR_WSDL_EMBALAGEM')
SENIOR_WS_USER = config('SENIOR_WS_USER', default='')
SENIOR_WS_PASSWORD = config('SENIOR_WS_PASSWORD', default='')

# VTEX API
VTEX_ACCOUNT_NAME = config('VTEX_ACCOUNT_NAME', default='')
VTEX_APP_KEY = config('VTEX_APP_KEY', default='')
VTEX_APP_TOKEN = config('VTEX_APP_TOKEN', default='')
