"""Base classes for tenant-owned data.

Every tenant-owned model inherits `TenantOwnedModel`. Its default manager filters by the
active Tenant and refuses to run without one, so forgetting a filter fails loudly
instead of returning every Tenant's rows. Saving checks the row belongs to the active
Tenant, so data can't be written across Tenants by passing the wrong object either.
"""

from typing import Any, ClassVar
from uuid import UUID

from django.db import models

from grc.core.tenancy import current_tenant_id


class TenantMismatchError(RuntimeError):
    """A row was written for a different Tenant than the one the transaction acts for."""


class TenantManager[M: models.Model](models.Manager[M]):
    def get_queryset(self) -> models.QuerySet[M]:
        return super().get_queryset().filter(tenant_id=current_tenant_id())


class TenantOwnedModel(models.Model):
    tenant = models.ForeignKey(
        "organization.Tenant",
        on_delete=models.PROTECT,
        related_name="+",
        editable=False,
    )

    objects: ClassVar[TenantManager[Any]] = TenantManager()

    class Meta:
        abstract = True

    def save(self, *args: Any, **kwargs: Any) -> None:
        active = current_tenant_id()
        # Typed as always set, but empty until the row is first assigned a Tenant.
        own: UUID | None = self.__dict__.get("tenant_id")
        if own is None:
            self.tenant_id = active
        elif own != active:
            raise TenantMismatchError("Refusing to write a row of another Tenant.")
        super().save(*args, **kwargs)
