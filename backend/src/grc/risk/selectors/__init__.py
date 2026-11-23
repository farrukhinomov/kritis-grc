"""Reading the Hazard catalogue, Risks and the risk matrix."""

from typing import Any

from django.db.models import F, Prefetch, QuerySet
from rest_framework import status

from grc.core.actor import Actor
from grc.core.ids import uuid_or_none
from grc.core.problems import Problem
from grc.risk.models import Hazard, Risk, RiskAsset, RiskCategory, Treatment
from grc.risk.selectors.rating import categorize, rating, score_range

RATINGS = ("inherent", "residual", "target")
LEVELS = frozenset({"1", "2", "3", "4"})
PENDING = "pending"


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


def risks(actor: Actor, *, scope: str | None = None, asset: str | None = None) -> QuerySet[Risk]:
    items: QuerySet[Risk] = (
        Risk.objects.select_related("scope", "hazard", "owner")
        .prefetch_related(
            Prefetch(
                "affected",
                queryset=RiskAsset.objects.select_related("asset").order_by("position"),
            ),
            Prefetch("treatments", queryset=Treatment.objects.order_by("position")),
        )
        .annotate(
            inherent_score=F("inherent_likelihood") * F("inherent_impact"),
            target_score=F("target_likelihood") * F("target_impact"),
        )
    )
    if actor.scope_ids is not None:
        items = items.filter(scope_id__in=actor.scope_ids)
    # An ID that isn't a UUID can't match anything.
    if scope is not None:
        wanted_scope = uuid_or_none(scope)
        items = items.filter(scope_id=wanted_scope) if wanted_scope else items.none()
    if asset is not None:
        wanted_asset = uuid_or_none(asset)
        items = items.filter(affected__asset_id=wanted_asset) if wanted_asset else items.none()
    return items.order_by("scope__name", "title_de", "id")


def filtered(
    items: QuerySet[Risk],
    *,
    rating_kind: str | None,
    category: str | None,
    likelihood: str | None,
    impact: str | None,
) -> QuerySet[Risk]:
    """Narrows to one category or cell of one rating. Invalid values are refused rather
    than ignored, so a typo never looks like a filter that matched nothing."""
    kind = rating_kind or "residual"
    valid_category = (
        category is None
        or category in RiskCategory.values
        or (category == PENDING and kind == "residual")
    )
    valid_cell = all(value is None or value in LEVELS for value in (likelihood, impact))
    if kind not in RATINGS or not valid_category or not valid_cell:
        raise Problem(
            status.HTTP_400_BAD_REQUEST, "invalid_filter", "Unknown rating, category or cell."
        )
    if category == PENDING:
        return items.filter(residual_score__isnull=True)
    if category is not None:
        lowest, highest = score_range(category)
        items = items.filter(**{f"{kind}_score__gte": lowest, f"{kind}_score__lte": highest})
    if likelihood is not None:
        items = items.filter(**{f"{kind}_likelihood": int(likelihood)})
    if impact is not None:
        items = items.filter(**{f"{kind}_impact": int(impact)})
    return items


def ordered(items: QuerySet[Risk], ordering: str | None) -> QuerySet[Risk]:
    if ordering is None:
        return items
    if ordering != "-residual_score":
        raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_ordering", "Unknown ordering.")
    # A Risk the engine hasn't rated yet must not look harmless: it comes after the rated
    # ones, in inherent order, rather than mixed in as if its score were zero.
    return items.order_by(
        F("residual_score").desc(nulls_last=True), F("inherent_score").desc(), "title_de", "id"
    )


def risk_matrix(items: QuerySet[Risk], rating_kind: str | None) -> dict[str, Any]:
    kind = rating_kind or "residual"
    if kind not in RATINGS:
        raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_filter", "Unknown rating.")
    counts: dict[tuple[int, int], int] = {}
    total = pending = 0
    for likelihood, impact in items.values_list(f"{kind}_likelihood", f"{kind}_impact"):
        total += 1
        if likelihood is None:
            pending += 1
            continue
        counts[likelihood, impact] = counts.get((likelihood, impact), 0) + 1
    return {
        "cells": [
            {
                "likelihood": likelihood,
                "impact": impact,
                "count": count,
                # A cell has one score, so every Risk in it shares one category.
                "worst_category": categorize(likelihood * impact).value,
            }
            for (likelihood, impact), count in sorted(counts.items())
        ],
        "pending": pending,
        "total": total,
    }


def present_risk(risk: Risk) -> dict[str, Any]:
    owner = risk.owner
    affected = [link.asset for link in risk.affected.all()]
    return {
        "id": str(risk.id),
        "scope_id": str(risk.scope_id),
        "scope_name": risk.scope.name,
        "hazard_id": str(risk.hazard_id),
        "hazard": {
            "id": str(risk.hazard_id),
            "category": risk.hazard.category,
            "name_de": risk.hazard.name_de,
            "name_en": risk.hazard.name_en,
        },
        "asset_ids": [str(asset.id) for asset in affected],
        "assets": [
            {"id": str(asset.id), "name": asset.name, "criticality": asset.criticality}
            for asset in affected
        ],
        "title_de": risk.title_de,
        "owner_id": str(owner.pk) if owner else None,
        "owner_name": (owner.display_name or owner.email) if owner else None,
        "inherent": rating(risk.inherent_likelihood, risk.inherent_impact),
        "target": rating(risk.target_likelihood, risk.target_impact),
        "residual": _residual(risk),
        "treatments": [
            {
                "implementation_id": str(t.implementation_id),
                "dimension": t.dimension,
                "levels": t.levels,
            }
            for t in risk.treatments.all()
        ],
    }


def _residual(risk: Risk) -> dict[str, Any] | None:
    if risk.residual_likelihood is None or risk.residual_impact is None:
        return None
    return {
        **rating(risk.residual_likelihood, risk.residual_impact),
        # The stored category is the engine's; the score bands above only mirror it.
        "category": risk.residual_category,
        "method_version": risk.method_version,
        "explanation": risk.residual_explanation,
    }
