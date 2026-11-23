"""Removing all of one Tenant's data, for the nightly reset of the Demo Tenant.

The Activity Log refuses deletes unless the transaction switches its purge on, so a
purge can only happen on purpose and only within one transaction. Each module purges
its own tables, children before parents, through this helper; rows go together with
their Activity Log events, which deleting a tracked row itself would otherwise add to.
"""

from collections.abc import Iterator, Sequence
from contextlib import contextmanager

from django.apps import apps
from django.db import connection, models

from grc.core.tenancy import NotInTransactionError, current_tenant_id

PURGE_SETTING = "app.allow_activity_purge"


@contextmanager
def activity_purge() -> Iterator[None]:
    """Allows deleting Activity Log events until the transaction ends."""
    if not connection.in_atomic_block:
        raise NotInTransactionError("A purge must run inside one transaction.")
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config(%s, 'on', true)", [PURGE_SETTING])
    try:
        yield
    finally:
        if not connection.needs_rollback:
            with connection.cursor() as cursor:
                cursor.execute("SELECT set_config(%s, '', true)", [PURGE_SETTING])


def purge_rows(tenant_models: Sequence[type[models.Model]]) -> int:
    """Deletes the active Tenant's rows of each model, in the given order, with events."""
    tenant_id = current_tenant_id()
    deleted = 0
    for model in tenant_models:
        deleted += model._default_manager.all().delete()[0]
        event_model = _event_model(model)
        if event_model is not None:
            # Event tables are read across models, so their manager doesn't filter by
            # Tenant; the filter is explicit here, and row-level security holds anyway.
            event_model._default_manager.filter(tenant_id=tenant_id).delete()
    return deleted


def _event_model(model: type[models.Model]) -> type[models.Model] | None:
    try:
        return apps.get_model(model._meta.app_label, f"{model.__name__}Event")
    except LookupError:
        return None
