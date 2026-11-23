"""Assets and their dependencies. Only this module writes these tables."""

import uuid
from typing import ClassVar

from django.db import models

from grc.core.history import tracked
from grc.core.models import TenantOwnedModel


class AssetKind(models.TextChoices):
    TECHNICAL_SYSTEM = "technical_system", "technical system"
    IT_SYSTEM = "it_system", "IT system"
    BUILDING = "building", "building"
    UTILITY = "utility", "utility"
    SUPPLIER = "supplier", "supplier"


class Criticality(models.TextChoices):
    LOW = "low", "low"
    MEDIUM = "medium", "medium"
    HIGH = "high", "high"


@tracked()
class Asset(TenantOwnedModel):
    """Anything a Scope depends on to deliver its service."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.ForeignKey("organization.Scope", on_delete=models.CASCADE, related_name="+")
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=32, choices=AssetKind.choices)
    criticality = models.CharField(max_length=16, choices=Criticality.choices)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name


class AssetDependency(TenantOwnedModel):
    """One Asset needing another. Its own model, so the link is tenant-owned like its ends."""

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="dependencies")
    depends_on = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["asset", "depends_on"], name="unique_asset_dependency"),
            models.CheckConstraint(
                condition=~models.Q(asset=models.F("depends_on")), name="asset_not_own_dependency"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.asset_id} needs {self.depends_on_id}"
