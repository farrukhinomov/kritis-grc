"""Runtime configuration, read from environment variables and validated at startup.

Errors name the variables but never echo their values.
"""

from enum import StrEnum
from typing import Literal

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # Required on purpose: a forgotten variable must not quietly expose the interactive
    # docs of a production instance.
    app_env: Environment
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    port: int = 8080

    @property
    def is_production(self) -> bool:
        return self.app_env is Environment.PRODUCTION


class ConfigurationError(RuntimeError):
    pass


def load_settings() -> Settings:
    try:
        # Values come from the environment, not from arguments.
        return Settings()
    except ValidationError as error:
        problems = sorted(
            f"{str(issue['loc'][0]).upper()} ({_kind(issue['type'])})" for issue in error.errors()
        )
        raise ConfigurationError(
            "Invalid or missing configuration: " + ", ".join(problems)
        ) from None


def _kind(error_type: str) -> str:
    # Pydantic's own messages can quote the rejected input, so only the category is reported.
    return "missing" if error_type == "missing" else "invalid"
