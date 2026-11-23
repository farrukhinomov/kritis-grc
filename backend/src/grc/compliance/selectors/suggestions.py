"""Reading Mapping Suggestions as a reviewer works through them."""

from typing import Any

from django.db.models import F, QuerySet
from rest_framework import status

from grc.compliance.models import MappingSuggestion, Requirement, SuggestionStatus
from grc.core.actor import Actor, Permission
from grc.core.problems import Problem


def suggestions(*, status_filter: str | None = None) -> QuerySet[MappingSuggestion]:
    """Pending first, in the order of the statute they would map to; then the latest
    decisions first, so a reviewer works through the law and still sees what was done."""
    if status_filter is not None and status_filter not in SuggestionStatus.values:
        raise Problem(
            status.HTTP_400_BAD_REQUEST, "invalid_filter", f'Unknown status "{status_filter}".'
        )
    items = MappingSuggestion.objects.select_related(
        "target_requirement__framework_version__framework",
        "source_requirement__framework_version__framework",
        "decided_by",
    )
    if status_filter is not None:
        items = items.filter(status=status_filter)
    return items.order_by(
        F("decided_at").desc(nulls_first=True), "target_requirement__position", "id"
    )


def may_decide(actor: Actor) -> bool:
    """A Mapping applies to the whole Tenant, so only a Membership for all of it decides."""
    return actor.can(Permission.APPROVE) and actor.scope_ids is None


def awaiting_decision_by(actor: Actor) -> list[dict[str, Any]]:
    if not may_decide(actor):
        return []
    return [
        {
            "kind": "mapping_suggestion",
            "id": str(s.id),
            "title": f"{s.target_requirement.citation} {s.target_requirement.title_de}",
            "detail": f"{s.source_requirement.citation} {s.source_requirement.title_de}",
            "scope_id": None,
            "submitted_by_name": None,
            "submitted_at": _instant(s.created_at),
        }
        for s in suggestions(status_filter=SuggestionStatus.PENDING)
    ]


def present_suggestion(suggestion: MappingSuggestion) -> dict[str, Any]:
    decider = suggestion.decided_by
    return {
        "id": str(suggestion.id),
        "target_requirement_id": suggestion.target_requirement_id,
        "source_requirement_id": suggestion.source_requirement_id,
        "target": _reference(suggestion.target_requirement),
        "source": _reference(suggestion.source_requirement),
        "coverage": suggestion.coverage,
        "confidence": float(suggestion.confidence),
        "rationale_de": suggestion.rationale_de,
        "rationale_en": suggestion.rationale_en,
        "status": suggestion.status,
        "model": suggestion.model,
        "created_at": _instant(suggestion.created_at),
        "decided_by_id": str(suggestion.decided_by_id) if suggestion.decided_by_id else None,
        "decided_by_name": (decider.display_name or decider.email) if decider else None,
        "decided_at": _instant(suggestion.decided_at) if suggestion.decided_at else None,
    }


def _reference(requirement: Requirement) -> dict[str, Any]:
    return {
        "id": requirement.id,
        "citation": requirement.citation,
        "title_de": requirement.title_de,
        "title_en": requirement.title_en,
        "framework_name": requirement.framework_version.framework.name,
    }


def _instant(value: Any) -> str:
    return str(value.isoformat().replace("+00:00", "Z"))
