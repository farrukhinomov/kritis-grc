"""Reading Risk Assessments."""

from typing import Any

from django.db.models import Prefetch, QuerySet
from rest_framework import status

from grc.core.actor import Actor, Permission
from grc.core.ids import uuid_or_none
from grc.core.problems import Problem
from grc.organization.selectors.legal import add_months
from grc.risk.models import AssessmentStatus, RiskAssessment, RiskAssessmentRisk

# The law asks for a new Risk Assessment at least every four years.
VALID_MONTHS = 48


def risk_assessments(
    actor: Actor, *, status_filter: str | None = None, scope: str | None = None
) -> QuerySet[RiskAssessment]:
    if status_filter is not None and status_filter not in AssessmentStatus.values:
        raise Problem(
            status.HTTP_400_BAD_REQUEST, "invalid_filter", f'Unknown status "{status_filter}".'
        )
    items: QuerySet[RiskAssessment] = RiskAssessment.objects.select_related(
        "scope", "submitted_by", "decided_by"
    ).prefetch_related(
        Prefetch("reviewed", queryset=RiskAssessmentRisk.objects.order_by("position"))
    )
    if actor.scope_ids is not None:
        items = items.filter(scope_id__in=actor.scope_ids)
    if status_filter is not None:
        items = items.filter(status=status_filter)
    if scope is not None:
        wanted = uuid_or_none(scope)
        items = items.filter(scope_id=wanted) if wanted else items.none()
    return items.order_by("-assessed_on", "id")


def present_assessment(assessment: RiskAssessment) -> dict[str, Any]:
    def name(user: Any) -> str | None:
        return (user.display_name or user.email) if user else None

    approved = assessment.status == AssessmentStatus.APPROVED
    return {
        "id": str(assessment.id),
        "scope_id": str(assessment.scope_id),
        "scope_name": assessment.scope.name,
        "title_de": assessment.title_de,
        "assessed_on": assessment.assessed_on.isoformat(),
        "status": assessment.status,
        "risk_ids": [str(link.risk_id) for link in assessment.reviewed.all()],
        "summary_de": assessment.summary_de,
        "submitted_by_id": str(assessment.submitted_by_id),
        "submitted_by_name": name(assessment.submitted_by) or "",
        "submitted_at": _instant(assessment.submitted_at),
        "decided_by_id": str(assessment.decided_by_id) if assessment.decided_by_id else None,
        "decided_by_name": name(assessment.decided_by),
        "decided_at": _instant(assessment.decided_at) if assessment.decided_at else None,
        "decision_note_de": assessment.decision_note_de or None,
        # Calculated on every read, so a change of the rule can't leave stale dates behind.
        "next_due": (
            add_months(assessment.assessed_on, VALID_MONTHS).isoformat() if approved else None
        ),
    }


def _instant(value: Any) -> str:
    return str(value.isoformat().replace("+00:00", "Z"))


def awaiting_decision_by(actor: Actor) -> list[dict[str, Any]]:
    """Submitted Risk Assessments the actor may decide: never their own, oldest first.

    Someone who can't approve has nothing waiting, which is an empty inbox, not an error.
    """
    if not actor.can(Permission.APPROVE):
        return []
    waiting = (
        risk_assessments(actor, status_filter=AssessmentStatus.SUBMITTED)
        .exclude(submitted_by_id=actor.user_id)
        .order_by("submitted_at", "id")
    )
    return [
        {
            "kind": "risk_assessment",
            "id": str(item.id),
            "title": item.title_de,
            "detail": item.scope.name,
            "scope_id": str(item.scope_id),
            "submitted_by_name": item.submitted_by.display_name or item.submitted_by.email,
            "submitted_at": _instant(item.submitted_at),
        }
        for item in waiting
    ]
