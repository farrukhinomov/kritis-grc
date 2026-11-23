"""Reading the Hazard catalogue and Risks."""

from typing import Any

from django.db.models import QuerySet

from grc.risk.models import Hazard


def hazards() -> QuerySet[Hazard]:
    return Hazard.objects.order_by("category", "name_de", "id")


def present_hazard(hazard: Hazard) -> dict[str, Any]:
    return {
        "id": str(hazard.id),
        "category": hazard.category,
        "name_de": hazard.name_de,
        "name_en": hazard.name_en,
        "description_de": hazard.description_de,
    }
