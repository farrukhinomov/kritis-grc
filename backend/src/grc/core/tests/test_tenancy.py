from uuid import uuid4

import pytest
from django.db import connection, transaction

from grc.core.tenancy import (
    NotInTransactionError,
    TenantContextMissingError,
    current_tenant_id,
    has_tenant_context,
    tenant_context,
    tenant_transaction,
    user_context,
)


def _setting(name: str) -> str | None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT current_setting(%s, true)", [name])
        value: str | None = cursor.fetchone()[0]
        return value


def test_no_tenant_is_active_by_default() -> None:
    assert not has_tenant_context()
    with pytest.raises(TenantContextMissingError):
        current_tenant_id()


@pytest.mark.django_db(transaction=True)
def test_refuses_to_set_a_tenant_outside_a_transaction() -> None:
    with pytest.raises(NotInTransactionError), tenant_context(uuid4()):
        pass  # pragma: no cover - never reached


@pytest.mark.django_db
def test_sets_the_tenant_for_the_orm_and_the_database_until_the_block_ends() -> None:
    tenant_id = uuid4()

    with tenant_context(tenant_id):
        assert current_tenant_id() == tenant_id
        assert _setting("app.tenant_id") == str(tenant_id)

    assert not has_tenant_context()
    assert _setting("app.tenant_id") == ""


@pytest.mark.django_db
def test_an_inner_tenant_replaces_the_outer_one_only_inside_its_block() -> None:
    outer, inner = uuid4(), uuid4()

    with tenant_context(outer):
        with tenant_context(inner):
            assert current_tenant_id() == inner
        assert current_tenant_id() == outer


@pytest.mark.django_db(transaction=True)
def test_the_database_setting_is_gone_after_the_transaction() -> None:
    with tenant_transaction(uuid4()):
        assert _setting("app.tenant_id")

    with transaction.atomic():
        assert not _setting("app.tenant_id")


@pytest.mark.django_db
def test_sets_the_user_for_the_database() -> None:
    with user_context(42):
        assert _setting("app.user_id") == "42"
    assert _setting("app.user_id") == ""


def test_rls_refuses_anything_but_a_plain_table_name() -> None:
    from grc.core.rls import tenant_rls

    with pytest.raises(ValueError, match="plain table name"):
        tenant_rls('scope"; DROP TABLE x; --')
