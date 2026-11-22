"""Fixtures shared by every module's tests."""

from collections.abc import Callable

import pytest
from django.core.cache import cache
from django.db import connection

# The test database is reached as a superuser, which row-level security never applies
# to. Isolation tests switch to this role, which has the application role's rights: data
# access, no table ownership, no BYPASSRLS.
RLS_PROBE_ROLE = "grc_rls_probe"


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
