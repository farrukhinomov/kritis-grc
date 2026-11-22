"""Every model is either tenant-owned and protected twice, or declared platform-wide.

A new model fails here until it has made that choice, so isolation can't be forgotten.
"""

import pytest
from django.apps import apps
from django.db import connection, models

from grc.core.models import TenantManager, TenantOwnedModel
from grc.core.rls import POLICY_NAME

# Platform-wide data: identical for every Tenant or the root of isolation itself.
PLATFORM_MODELS = frozenset(
    {
        "organization.User",
        "organization.Tenant",
        # The legal catalogue is public law, the same for every Tenant.
        "compliance.Framework",
        "compliance.FrameworkVersion",
        "compliance.Requirement",
        "compliance.PlatformMapping",
    }
)
# Tenant data read by its own user before a Tenant is chosen; the row policy admits both.
USER_READABLE_MODELS = frozenset({"organization.Membership"})


def _grc_models() -> list[type[models.Model]]:
    return [m for m in apps.get_models() if m.__module__.startswith("grc.")]


def _has_tenant(model: type[models.Model]) -> bool:
    return any(field.name == "tenant" for field in model._meta.fields)


def test_every_model_declares_whether_it_is_tenant_owned() -> None:
    undeclared = [
        m._meta.label
        for m in _grc_models()
        if not _has_tenant(m) and m._meta.label not in PLATFORM_MODELS
    ]

    assert undeclared == [], "Add tenant ownership or list the model as platform-wide."


def test_tenant_owned_models_filter_by_the_active_tenant() -> None:
    unguarded = [
        m._meta.label
        for m in _grc_models()
        if _has_tenant(m)
        and m._meta.label not in USER_READABLE_MODELS
        and not (issubclass(m, TenantOwnedModel) and isinstance(m._default_manager, TenantManager))
    ]

    assert unguarded == []


@pytest.mark.django_db
def test_tenant_owned_tables_have_a_forced_row_level_policy() -> None:
    tables = [m._meta.db_table for m in _grc_models() if _has_tenant(m)]
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname
            FROM pg_class c
            WHERE c.relname = ANY(%s)
              AND c.relrowsecurity AND c.relforcerowsecurity
              AND EXISTS (
                SELECT FROM pg_policies p
                WHERE p.tablename = c.relname AND p.policyname = %s
              )
            """,
            [tables, POLICY_NAME],
        )
        protected = {row[0] for row in cursor.fetchall()}

    assert tables
    assert sorted(set(tables) - protected) == []
