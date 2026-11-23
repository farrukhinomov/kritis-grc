"""Writing Hazards and Risks."""

from typing import Any
from uuid import UUID

from grc.risk.models import Hazard


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
