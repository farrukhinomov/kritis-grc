"""Runtime configuration, read from environment variables and validated at startup.

Every value that differs between environments comes from here. The process refuses to
start when something is missing or malformed, and the error names the variables but
never echoes their values, so secrets cannot end up in logs.
"""

from enum import StrEnum
from pathlib import Path
from typing import Annotated, Literal, Self

from django.core.exceptions import ImproperlyConfigured
from pydantic import (
    Field,
    HttpUrl,
    PostgresDsn,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)
from pydantic_core import ErrorDetails, PydanticCustomError
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = BACKEND_DIR / ".env"


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    PRODUCTION = "production"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # Required on purpose: a forgotten variable must not quietly turn a server into a
    # local development instance with debug output and insecure cookies.
    app_env: Environment
    # Django's deployment check requires at least 50 characters.
    django_secret_key: SecretStr = Field(min_length=50)
    database_url: PostgresDsn
    allowed_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)
    csrf_trusted_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # Off unless asked for: the password-less demo login must never appear by accident.
    demo_login_enabled: bool = False
    # The shared demo fixtures; next to the backend in the repository, copied into images.
    seed_dir: Path = BACKEND_DIR.parent / "seed"
    # S3-compatible object store for Evidence files. Unset, uploads answer 503.
    storage_endpoint_url: str | None = None
    # What browsers reach; defaults to the endpoint when server and browser share it.
    storage_public_endpoint_url: str | None = None
    storage_bucket: str | None = None
    storage_region: str = "auto"
    storage_access_key_id: SecretStr | None = None
    storage_secret_access_key: SecretStr | None = None
    # The stateless service that calculates Residual Ratings. Unset outside production,
    # Risks stay "calculation pending" and their recalculation is retried.
    risk_engine_url: HttpUrl | None = None

    @field_validator("allowed_hosts", "csrf_trusted_origins", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _production_needs_explicit_origins(self) -> Self:
        # Empty lists would make Django reject every request (hosts) or every form post
        # (origins), so production must name them rather than fail at runtime.
        if self.app_env is Environment.PRODUCTION:
            missing = [
                name
                for name in ("allowed_hosts", "csrf_trusted_origins", "risk_engine_url")
                if not getattr(self, name)
            ]
            if missing:
                raise PydanticCustomError("missing", ",".join(missing))
        return self


def load_settings(env_file: Path | None = DEFAULT_ENV_FILE) -> AppSettings:
    """Build the settings, turning validation errors into one readable startup error.

    A local `.env` file is read when present; real environments set variables directly.
    """
    try:
        return AppSettings(_env_file=env_file)
    except ValidationError as error:
        problems = sorted(_describe(issue) for issue in error.errors())
        raise ImproperlyConfigured(
            "Invalid or missing configuration: " + ", ".join(problems)
        ) from None


def _describe(issue: ErrorDetails) -> str:
    # Pydantic's own messages can quote the rejected input, so only names and the kind of
    # problem are reported.
    kind = "missing" if issue["type"] == "missing" else "invalid"
    if issue["loc"]:
        return f"{str(issue['loc'][0]).upper()} ({kind})"
    # Cross-field rules report the affected field names as their message.
    return ", ".join(f"{name.upper()} ({kind})" for name in issue["msg"].split(","))
