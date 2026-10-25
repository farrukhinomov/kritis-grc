import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from config.env import load_settings

BACKEND_DIR = Path(__file__).resolve().parents[4]
REQUIRED = ("APP_ENV", "DJANGO_SECRET_KEY", "DATABASE_URL")


def test_missing_configuration_names_every_missing_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name in REQUIRED:
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(ImproperlyConfigured) as excinfo:
        load_settings(env_file=None)

    message = str(excinfo.value)
    for name in REQUIRED:
        assert name in message


def test_error_message_never_contains_secret_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DJANGO_SECRET_KEY", "super-secret-value-123")
    monkeypatch.setenv("DATABASE_URL", "not a url")

    with pytest.raises(ImproperlyConfigured) as excinfo:
        load_settings(env_file=None)

    assert "super-secret-value-123" not in str(excinfo.value)
    assert "DATABASE_URL" in str(excinfo.value)


def test_production_settings_pass_djangos_deployment_checks() -> None:
    env = {
        **os.environ,
        "APP_ENV": "production",
        "DJANGO_SECRET_KEY": secrets.token_urlsafe(64),
        "DATABASE_URL": "postgres://app:pw@db.example.internal:6543/grc",
        "ALLOWED_HOSTS": "grc.example.com",
        "CSRF_TRUSTED_ORIGINS": "https://grc.example.com",
    }
    result = subprocess.run(
        [sys.executable, "manage.py", "check", "--deploy", "--fail-level", "WARNING"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr + result.stdout


def test_production_requires_hosts_and_trusted_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("CSRF_TRUSTED_ORIGINS", raising=False)

    with pytest.raises(ImproperlyConfigured) as excinfo:
        load_settings(env_file=None)

    assert "ALLOWED_HOSTS" in str(excinfo.value)
    assert "CSRF_TRUSTED_ORIGINS" in str(excinfo.value)
