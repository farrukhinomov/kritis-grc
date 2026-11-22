"""Changing an Implementation safely.

Two people can open the same Implementation; whoever saves second must not silently undo
the first. Every change names the version it was based on, and a stale one is refused.
Saving without any actual change keeps the version, so it can't cause conflicts either.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from django.utils import timezone
from rest_framework import status

from grc.compliance.models import Implementation
from grc.core.actor import Actor, Permission
from grc.core.problems import FieldProblem, Problem
from grc.organization.selectors import is_member

CHANGEABLE = ("status", "owner_id", "due_date", "note_de")


def change_implementation(
    actor: Actor, implementation_id: UUID, based_on: int | None, change: dict[str, Any]
) -> Implementation:
    actor.require(Permission.CHANGE)
    implementation: Implementation | None = (
        Implementation.objects.select_for_update()
        .filter(id=implementation_id, **_visible(actor))
        .first()
    )
    if implementation is None:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if based_on is None:
        raise Problem(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "precondition_required",
            "Send If-Match with the version you edited.",
        )
    if based_on != implementation.version:
        raise Problem(
            status.HTTP_412_PRECONDITION_FAILED,
            "version_conflict",
            "Someone else changed this in the meantime.",
        )
    owner = change.get("owner_id")
    if owner is not None and not is_member(actor, owner):
        raise FieldProblem([{"field": "owner_id", "code": "invalid_choice"}])
    new = {
        "status": change.get("status", implementation.status),
        "owner_id": change.get("owner_id", implementation.owner_id),
        "due_date": change.get("due_date", implementation.due_date),
        "note_de": (change.get("note_de") or "") if "note_de" in change else implementation.note_de,
    }
    if all(getattr(implementation, field) == value for field, value in new.items()):
        return implementation
    for field, value in new.items():
        setattr(implementation, field, value)
    implementation.version += 1
    implementation.updated_at = timezone.now()
    implementation.save()
    return implementation


def load_implementations(
    rows: list[dict[str, Any]],
    ids: dict[str, UUID],
    scopes: dict[str, UUID],
    users: dict[str, int],
) -> None:
    """Loads Implementations into the active Tenant under stable identifiers."""
    for row in rows:
        owner = row.get("owner_id")
        due = row.get("due_date")
        Implementation.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "requirement_id": row["requirement_id"],
                "scope_id": scopes[row["scope_id"]],
                "status": row["status"],
                "owner_id": users[owner] if owner else None,
                "due_date": date.fromisoformat(due) if due else None,
                "note_de": row.get("note_de") or "",
                "version": row["version"],
                "updated_at": datetime.fromisoformat(row["updated_at"]),
            },
        )


def _visible(actor: Actor) -> dict[str, Any]:
    return {} if actor.scope_ids is None else {"scope_id__in": actor.scope_ids}
