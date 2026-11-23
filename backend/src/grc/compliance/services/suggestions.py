"""Deciding Mapping Suggestions.

The model only proposes. Approving turns a suggestion into a Tenant Mapping in the same
transaction, so there is never an approved suggestion without its Mapping or the other
way round. A decision is final: deciding again is a conflict, not an overwrite.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.utils import timezone
from rest_framework import status

from grc.compliance.models import MappingSuggestion, SuggestionStatus, TenantMapping
from grc.compliance.selectors.suggestions import may_decide
from grc.core.actor import Actor, Permission
from grc.core.problems import Problem


def approve(actor: Actor, suggestion_id: UUID) -> TenantMapping:
    suggestion = _decide(actor, suggestion_id, SuggestionStatus.APPROVED)
    mapping: TenantMapping = TenantMapping.objects.create(
        target_requirement_id=suggestion.target_requirement_id,
        source_requirement_id=suggestion.source_requirement_id,
        coverage=suggestion.coverage,
        justification_de=suggestion.rationale_de,
        approved_by_id=actor.user_id,
        approved_at=suggestion.decided_at,
    )
    return mapping


def reject(actor: Actor, suggestion_id: UUID) -> MappingSuggestion:
    return _decide(actor, suggestion_id, SuggestionStatus.REJECTED)


def _decide(actor: Actor, suggestion_id: UUID, decision: str) -> MappingSuggestion:
    actor.require(Permission.APPROVE)
    if not may_decide(actor):
        raise Problem(
            status.HTTP_403_FORBIDDEN,
            "scope_limited",
            "Mappings apply to the whole Tenant; a Scope-limited Membership can't decide them.",
        )
    suggestion: MappingSuggestion | None = (
        MappingSuggestion.objects.select_for_update().filter(id=suggestion_id).first()
    )
    if suggestion is None:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if suggestion.status != SuggestionStatus.PENDING:
        raise Problem(
            status.HTTP_409_CONFLICT,
            "suggestion_already_decided",
            "This suggestion was already decided.",
        )
    suggestion.status = decision
    suggestion.decided_by_id = actor.user_id
    suggestion.decided_at = timezone.now()
    suggestion.save(update_fields=["status", "decided_by_id", "decided_at"])
    return suggestion


def load_mapping_suggestions(
    rows: list[dict[str, Any]], ids: dict[str, UUID], users: dict[str, int]
) -> None:
    """Loads Mapping Suggestions into the active Tenant under stable identifiers."""
    for row in rows:
        decided_at = row.get("decided_at")
        MappingSuggestion.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "target_requirement_id": row["target_requirement_id"],
                "source_requirement_id": row["source_requirement_id"],
                "coverage": row["coverage"],
                "confidence": Decimal(str(row["confidence"])),
                "rationale_de": row["rationale_de"],
                "rationale_en": row["rationale_en"],
                "model": row["model"],
                "status": row["status"],
                "created_at": datetime.fromisoformat(row["created_at"]),
                "decided_by_id": users.get(row.get("decided_by_id") or ""),
                "decided_at": datetime.fromisoformat(decided_at) if decided_at else None,
            },
        )
