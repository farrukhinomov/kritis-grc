"""Django settings.

There is one settings module for every environment. What differs between environments
comes from validated environment variables (see `config.env`), so no environment can
silently run with another one's defaults.
"""

from pathlib import Path
from urllib.parse import unquote

from config.env import Environment, load_settings

BASE_DIR = Path(__file__).resolve().parents[2]

env = load_settings()
IS_PRODUCTION = env.app_env is Environment.PRODUCTION

SECRET_KEY = env.django_secret_key.get_secret_value()
DEBUG = env.app_env is Environment.LOCAL
ALLOWED_HOSTS = env.allowed_hosts
CSRF_TRUSTED_ORIGINS = env.csrf_trusted_origins

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "grc.organization",
    "grc.assets",
    "grc.compliance",
    "grc.risk",
    "grc.activity",
    "grc.demo",
]

MIDDLEWARE = [
    # Outermost, so every log line below it carries the request and trace IDs.
    "grc.core.middleware.RequestContextMiddleware",
    # Wraps every middleware below it, so none of them can make an API response cacheable.
    "grc.core.middleware.ApiCacheControlMiddleware",
    # Before host validation and the HTTPS redirect: probes call the container by IP.
    "grc.core.health.HealthCheckMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

_db_host = env.database_url.hosts()[0]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": (env.database_url.path or "").lstrip("/"),
        "USER": unquote(_db_host["username"] or ""),
        "PASSWORD": unquote(_db_host["password"] or ""),
        "HOST": _db_host["host"],
        "PORT": _db_host["port"] or 5432,
        # Every request is one transaction, so transaction-local settings (the Tenant
        # for row-level security, the acting user for the history triggers) cover all
        # of its queries and vanish when it ends.
        "ATOMIC_REQUESTS": True,
        # The database sits behind a transaction-mode pooler: a server connection is
        # only ours for one transaction. Persistent connections and server-side
        # cursors would outlive that and fail intermittently.
        "CONN_MAX_AGE": 0,
        "DISABLE_SERVER_SIDE_CURSORS": True,
        "OPTIONS": {
            "connect_timeout": 5,
            # Never let psycopg prepare statements on its own: under a transaction pooler
            # the next transaction may run on a server connection that doesn't have them.
            "prepare_threshold": None,
            "sslmode": "require" if IS_PRODUCTION else "prefer",
        },
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "de"
LANGUAGES = [("de", "Deutsch"), ("en", "English")]
TIME_ZONE = "Europe/Berlin"
USE_I18N = True
USE_TZ = True

# Only /api/* is routed to Django in front of the SPA, so admin assets live under it.
STATIC_URL = "/api/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if IS_PRODUCTION
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        )
    },
}

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    # Closed by default: an endpoint must opt in to being public.
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "GRC Platform API",
    "DESCRIPTION": "KRITIS-Dachgesetz and NIS2 (BSIG) compliance for critical facilities.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
}

# TLS ends at the platform's load balancer, which reports the original scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = IS_PRODUCTION
SECURE_HSTS_SECONDS = 31_536_000 if IS_PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = IS_PRODUCTION
SESSION_COOKIE_SECURE = IS_PRODUCTION
CSRF_COOKIE_SECURE = IS_PRODUCTION
X_FRAME_OPTIONS = "DENY"
SILENCED_SYSTEM_CHECKS = [
    # HSTS preloading only applies to registrable domains; the app runs on a subdomain.
    "security.W021",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {"()": "grc.core.log_filters.RequestContextFilter"},
    },
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.json.JsonFormatter",
            "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s",
            "rename_fields": {"asctime": "time", "levelname": "severity", "name": "logger"},
        },
    },
    "handlers": {
        "stdout": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "json",
            "filters": ["request_context"],
        },
    },
    "root": {"handlers": ["stdout"], "level": env.log_level},
}
