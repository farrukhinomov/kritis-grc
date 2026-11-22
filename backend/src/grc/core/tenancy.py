"""The Tenant and user a database transaction acts for.

Tenant isolation has two layers that must agree. The ORM layer reads the Tenant from a
context variable and filters every tenant-owned query by it. The database layer reads
the same Tenant from the transaction-local setting `app.tenant_id`, which the row-level
security policies compare against. Both are set together here, and only inside a
transaction: a transaction-local setting is gone when the transaction ends, so it can't
leak to the next client of a pooled connection the way a session-wide `SET` would.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import UUID

from django.db import connection, transaction
from psycopg.pq import TransactionStatus

TENANT_SETTING = "app.tenant_id"
USER_SETTING = "app.user_id"

_current_tenant: ContextVar[UUID | None] = ContextVar("current_tenant", default=None)


class TenantContextMissingError(RuntimeError):
    """A tenant-owned query ran without a Tenant. Fails closed instead of returning all."""


class NotInTransactionError(RuntimeError):
    """A context was set outside a transaction, where it would not be transaction-local."""


def current_tenant_id() -> UUID:
    tenant_id = _current_tenant.get()
    if tenant_id is None:
        raise TenantContextMissingError("No Tenant is active for this query.")
    return tenant_id


def has_tenant_context() -> bool:
    return _current_tenant.get() is not None


@contextmanager
def tenant_context(tenant_id: UUID) -> Iterator[None]:
    """Acts for one Tenant until the block ends, in the ORM and in the database."""
    _set_local(TENANT_SETTING, str(tenant_id))
    token = _current_tenant.set(tenant_id)
    try:
        yield
    finally:
        _current_tenant.reset(token)
        _clear_local(TENANT_SETTING)


@contextmanager
def user_context(user_id: int) -> Iterator[None]:
    """Lets the database show a user their own Memberships before any Tenant is known."""
    _set_local(USER_SETTING, str(user_id))
    try:
        yield
    finally:
        _clear_local(USER_SETTING)


@contextmanager
def tenant_transaction(tenant_id: UUID) -> Iterator[None]:
    """One transaction acting for one Tenant: the entry point for jobs and event handlers."""
    with transaction.atomic(), tenant_context(tenant_id):
        yield


def _set_local(name: str, value: str) -> None:
    if not connection.in_atomic_block:
        raise NotInTransactionError(f"{name} can only be set inside a transaction.")
    with connection.cursor() as cursor:
        # The third argument makes the setting transaction-local.
        cursor.execute("SELECT set_config(%s, %s, true)", [name, value])


def _clear_local(name: str) -> None:
    # A failed transaction refuses further statements; it is rolled back anyway, and the
    # rollback discards the setting with it. Trying would only hide the original error.
    if not connection.in_atomic_block or connection.needs_rollback or _transaction_failed():
        return
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config(%s, '', true)", [name])


def _transaction_failed() -> bool:
    raw = connection.connection
    return raw is not None and raw.info.transaction_status == TransactionStatus.INERROR
