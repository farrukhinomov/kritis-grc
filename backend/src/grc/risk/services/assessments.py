"""Deciding Risk Assessments under the four-eyes rule.

Whoever submitted an assessment can't also decide it; the database enforces the same
rule, so no other code path can bypass it. A decision is final: deciding twice is a
conflict, not a silent overwrite.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from django.utils import timezone
from rest_framework import status

from grc.core.actor import Actor, Permission
from grc.core.problems import FieldProblem, Problem
from grc.risk.models import AssessmentStatus, RiskAssessment, RiskAssessmentRisk


def decide(actor: Actor, assessment_id: UUID, decision: str, note: str | None) -> RiskAssessment:
    actor.require(Permission.APPROVE)
    visible = {} if actor.scope_ids is None else {"scope_id__in": actor.scope_ids}
    assessment: RiskAssessment | None = (
        RiskAssessment.objects.select_for_update().filter(id=assessment_id, **visible).first()
    )
    if assessment is None:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if assessment.status != AssessmentStatus.SUBMITTED:
        raise Problem(
            status.HTTP_409_CONFLICT, "already_decided", "This Risk Assessment was already decided."
        )
    if assessment.submitted_by_id == actor.user_id:
        raise Problem(
            status.HTTP_403_FORBIDDEN,
            "own_submission",
            "A Risk Assessment can't be decided by its author.",
        )
    # What can't be decided at all is said first; a missing reason only after that.
    note = (note or "").strip()
    if decision == AssessmentStatus.REJECTED and not note:
        raise FieldProblem([{"field": "note_de", "code": "required"}])
    assessment.status = decision
    assessment.decided_by_id = actor.user_id
    assessment.decided_at = timezone.now()
    assessment.decision_note_de = note
    assessment.save()
    return assessment


def load_risk_assessments(
    rows: list[dict[str, Any]],
    ids: dict[str, UUID],
    *,
    scope_ids: dict[str, UUID],
    risk_ids: dict[str, UUID],
    user_ids: dict[str, int],
) -> None:
    """Loads Risk Assessments with their reviewed Risks into the active Tenant."""
    for row in rows:
        decided_at = row.get("decided_at")
        assessment, _ = RiskAssessment.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "scope_id": scope_ids[row["scope_id"]],
                "title_de": row["title_de"],
                "assessed_on": date.fromisoformat(row["assessed_on"]),
                "summary_de": row.get("summary_de", ""),
                "status": row["status"],
                "submitted_by_id": user_ids[row["submitted_by_id"]],
                "submitted_at": datetime.fromisoformat(row["submitted_at"]),
                "decided_by_id": user_ids.get(row.get("decided_by_id") or ""),
                "decided_at": datetime.fromisoformat(decided_at) if decided_at else None,
                "decision_note_de": row.get("decision_note_de") or "",
            },
        )
        RiskAssessmentRisk.objects.filter(assessment=assessment).delete()
        for position, risk in enumerate(row["risk_ids"]):
            RiskAssessmentRisk.objects.create(
                assessment=assessment, risk_id=risk_ids[risk], position=position
            )
