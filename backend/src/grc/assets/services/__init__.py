"""Writing Assets. In v1 they only come from fixtures; editing them comes later."""

from typing import Any
from uuid import UUID

from grc.assets.models import Asset, AssetDependency


def load_assets(
    rows: list[dict[str, Any]], ids: dict[str, UUID], scope_ids: dict[str, UUID]
) -> None:
    """Loads Assets and their dependencies into the active Tenant under stable identifiers.

    Dependencies are replaced, not merged, so the fixtures stay the single source of truth.
    They may cross Scopes: a plant depends on the organization's shared data center.
    """
    for row in rows:
        Asset.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "scope_id": scope_ids[row["scope_id"]],
                "name": row["name"],
                "kind": row["kind"],
                "criticality": row["criticality"],
                "description": row.get("description", ""),
            },
        )
    AssetDependency.objects.filter(asset_id__in=[ids[row["id"]] for row in rows]).delete()
    for row in rows:
        for needed in row.get("depends_on", []):
            AssetDependency.objects.create(asset_id=ids[row["id"]], depends_on_id=ids[needed])
