"""Writing Hazards and Risks."""

from typing import Any
from uuid import UUID

from grc.core.outbox.services import publish
from grc.risk.events import RiskRatingInputsChanged
from grc.risk.models import Hazard, Risk, RiskAsset, Treatment


def load_hazards(rows: list[dict[str, Any]], ids: dict[str, UUID]) -> None:
    """Loads a Hazard catalogue into the active Tenant under stable identifiers."""
    for row in rows:
        Hazard.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "category": row["category"],
                "name_de": row["name_de"],
                "name_en": row["name_en"],
                "description_de": row.get("description_de", ""),
            },
        )


def load_risks(
    rows: list[dict[str, Any]],
    ids: dict[str, UUID],
    *,
    scope_ids: dict[str, UUID],
    hazard_ids: dict[str, UUID],
    asset_ids: dict[str, UUID],
    implementation_ids: dict[str, UUID],
    user_ids: dict[str, int],
) -> None:
    """Loads Risks with their Assets and Treatments into the active Tenant.

    Assets and Treatments are replaced, not merged, so the fixtures stay the single
    source of truth. A Residual Rating is never loaded: only the risk engine sets it, so
    every loaded Risk is queued for (re)calculation, which waits for the engine if needed.
    """
    for row in rows:
        risk, _ = Risk.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "scope_id": scope_ids[row["scope_id"]],
                "hazard_id": hazard_ids[row["hazard_id"]],
                "title_de": row["title_de"],
                "owner_id": user_ids.get(row.get("owner_id") or ""),
                "inherent_likelihood": row["inherent"]["likelihood"],
                "inherent_impact": row["inherent"]["impact"],
                "target_likelihood": row["target"]["likelihood"],
                "target_impact": row["target"]["impact"],
            },
        )
        RiskAsset.objects.filter(risk=risk).delete()
        for position, asset in enumerate(row["asset_ids"]):
            RiskAsset.objects.create(risk=risk, asset_id=asset_ids[asset], position=position)
        Treatment.objects.filter(risk=risk).delete()
        for position, treatment in enumerate(row["treatments"]):
            Treatment.objects.create(
                risk=risk,
                implementation_id=implementation_ids[treatment["implementation_id"]],
                dimension=treatment["dimension"],
                levels=treatment["levels"],
                position=position,
            )
        publish(RiskRatingInputsChanged(risk_id=risk.id))
