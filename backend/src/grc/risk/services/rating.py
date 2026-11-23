"""Keeping each Risk's Residual Rating in step with its inputs.

The risk engine calculates; this module gathers the inputs (Inherent Rating, Treatments
and the current status of each treating Implementation), stores the answer with the
method version that produced it, and leaves a rating untouched when nothing changed.
"""

import logging
from collections.abc import Iterable
from uuid import UUID

from django.utils import timezone

from grc.compliance.selectors.implementations import implementation_statuses
from grc.risk import engine
from grc.risk.models import Risk, Treatment

logger = logging.getLogger(__name__)


def risks_treated_by(implementation_id: UUID) -> list[UUID]:
    return list(
        Treatment.objects.filter(implementation_id=implementation_id)
        .values_list("risk_id", flat=True)
        .distinct()
    )


def recalculate(risk_ids: Iterable[UUID]) -> int:
    """Recalculates the given Risks of the active Tenant; returns how many changed.

    The Risks are locked first and the statuses read after, so when two recalculations
    race, the one that writes last has also read last: a stale result can't win.
    Raises `RiskEngineUnavailableError` when the engine can't answer.
    """
    risks = list(
        Risk.objects.select_for_update(of=("self",))
        .filter(id__in=list(risk_ids))
        .prefetch_related("treatments")
        .order_by("id")
    )
    if not risks:
        return 0
    statuses = implementation_statuses(
        {t.implementation_id for risk in risks for t in risk.treatments.all()}
    )
    method_version, results = engine.score([_input(risk, statuses) for risk in risks])
    by_id = {str(risk.id): risk for risk in risks}
    changed = 0
    for result in results:
        risk = by_id[result.risk_id]
        new = {
            "residual_likelihood": result.likelihood,
            "residual_impact": result.impact,
            "residual_score": result.score,
            "residual_category": result.category,
            "residual_explanation": result.explanation,
            "method_version": method_version,
        }
        if all(getattr(risk, field) == value for field, value in new.items()):
            continue
        for field, value in new.items():
            setattr(risk, field, value)
        risk.residual_calculated_at = timezone.now()
        risk.save(update_fields=[*new, "residual_calculated_at"])
        changed += 1
    if changed:
        logger.info("residual ratings changed", extra={"risks": changed})
    return changed


def _input(risk: Risk, statuses: dict[UUID, str]) -> dict[str, object]:
    return {
        "risk_id": str(risk.id),
        "inherent": {"likelihood": risk.inherent_likelihood, "impact": risk.inherent_impact},
        "treatments": [
            {
                "implementation_id": str(t.implementation_id),
                "dimension": t.dimension,
                "levels": t.levels,
                # An Implementation that is gone counts as not in place.
                "implementation_status": statuses.get(t.implementation_id, "open"),
            }
            for t in sorted(risk.treatments.all(), key=lambda t: t.position)
        ],
    }
