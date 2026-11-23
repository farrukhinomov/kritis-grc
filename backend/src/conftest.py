"""Fixtures shared by every module's tests."""

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from django.core.cache import cache
from django.db import connection

# The test database is reached as a superuser, which row-level security never applies
# to. Isolation tests switch to this role, which has the application role's rights: data
# access, no table ownership, no BYPASSRLS.
RLS_PROBE_ROLE = "grc_rls_probe"


@pytest.fixture(autouse=True)
def _memory_storage(settings: Any) -> None:
    # Tests never reach a real object store; the in-memory one starts empty every time.
    from grc.core.testing.storage import MemoryStorage

    settings.GRC_STORAGE = "grc.core.testing.storage.MemoryStorage"
    MemoryStorage.reset()


@pytest.fixture(autouse=True)
def _fresh_cache() -> None:
    # Rate-limit counters live in the cache; one test's logins must not limit the next.
    cache.clear()


@pytest.fixture
def as_application_role(db: None) -> Callable[[], None]:
    """Returns a function that makes the rest of the test transaction run as the app role."""
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            DO $$ BEGIN
              IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{RLS_PROBE_ROLE}') THEN
                CREATE ROLE {RLS_PROBE_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS;
              END IF;
            END $$;
            GRANT USAGE ON SCHEMA public TO {RLS_PROBE_ROLE};
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
              TO {RLS_PROBE_ROLE};
            """
        )

    def switch() -> None:
        with connection.cursor() as cursor:
            # SET LOCAL ends with the test's transaction, which is always rolled back.
            cursor.execute(f"SET LOCAL ROLE {RLS_PROBE_ROLE}")

    return switch


@pytest.fixture(autouse=True)
def _no_risk_engine(settings: Any) -> Iterator[None]:
    # Tests never reach a real risk engine; without the fake below, none is configured
    # and Residual Ratings stay pending, as they would with the engine down.
    from grc.risk import engine

    settings.RISK_ENGINE_URL = None
    engine.reset_breaker()
    yield
    engine.reset_breaker()


@pytest.fixture
def risk_engine(settings: Any, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A risk engine held to its published contract; set `.down = True` to fail it."""
    from grc.risk import engine
    from grc.risk.testing import FakeRiskEngine

    fake = FakeRiskEngine()
    settings.RISK_ENGINE_URL = "http://risk-engine.test"
    monkeypatch.setattr(engine, "_transport", fake.transport)
    return fake


@pytest.fixture
def ai_service(settings: Any, monkeypatch: pytest.MonkeyPatch) -> Any:
    """The AI service's Mapping Suggestions, held to its published contract."""
    from grc.compliance import suggester
    from grc.compliance.testing import FakeSuggester

    fake = FakeSuggester()
    settings.RISK_ENGINE_URL = "http://risk-engine.test"
    monkeypatch.setattr(suggester, "_transport", fake.transport)
    return fake
