"""The Activity Log as people read it: who changed what, when, from which value to which.

Events are recorded by database triggers in each module's event tables; this module
only reads them. Writes without an acting person (loading the Demo Tenant) are recorded
too but not listed, since the log answers "who did this".
"""

import base64
import binascii
from datetime import datetime
from typing import Any

import pghistory.models
from django.db.models import Q
from rest_framework import status

from grc.compliance.selectors import requirements
from grc.core.actor import Actor
from grc.core.problems import Problem
from grc.organization.selectors import members_of, scopes

ACTIONS = ("created", "updated", "deleted", "approved", "rejected", "commented")
OBJECT_TYPES = {
    "compliance.Implementation": "implementation",
    "compliance.Evidence": "evidence",
    "compliance.TenantMapping": "mapping",
    "organization.Scope": "scope",
    "risk.Risk": "risk",
    "risk.RiskAssessment": "risk_assessment",
}
# Changes worth showing: an edit lists what changed, a decision its outcome and reason.
CHANGE_LABELS = ("updated", "approved", "rejected")
DEFAULT_LIMIT, MAX_LIMIT = 20, 100


def activity(
    actor: Actor,
    *,
    limit: int,
    cursor: str | None = None,
    object_id: str | None = None,
    object_type: str | None = None,
    action: str | None = None,
) -> dict[str, Any]:
    if action is not None and action not in ACTIONS:
        raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_filter", f'Unknown action "{action}".')
    events = pghistory.models.Events.objects.filter(
        pgh_data__tenant_id=str(actor.tenant_id),
        pgh_obj_model__in=list(OBJECT_TYPES),
        pgh_context__user__isnull=False,
    )
    if object_id is not None:
        events = events.filter(pgh_obj_id=object_id)
    if object_type is not None:
        models = [label for label, name in OBJECT_TYPES.items() if name == object_type]
        events = events.filter(pgh_obj_model__in=models)
    if action is not None:
        events = events.filter(pgh_label=action)
    if cursor is not None:
        occurred, slug = _decode(cursor)
        events = events.filter(
            Q(pgh_created_at__lt=occurred) | Q(pgh_created_at=occurred, pgh_slug__lt=slug)
        )
    page = list(events.order_by("-pgh_created_at", "-pgh_slug")[: limit + 1])
    more, page = len(page) > limit, page[:limit]
    names = _Names(actor)
    return {
        "items": [names.present(event) for event in page],
        "page": {"next_cursor": _encode(page[-1]) if more and page else None, "limit": limit},
    }


class _Names:
    """Turns IDs in events into what a reader recognizes, looked up once per page."""

    def __init__(self, actor: Actor) -> None:
        self.people = {
            str(m.user_id): m.user.display_name or m.user.email for m in members_of(actor)
        }
        self.scopes = {str(s.id): s.name for s in scopes(actor)}
        self.citations = dict(requirements().values_list("id", "citation"))

    def present(self, event: Any) -> dict[str, Any]:
        actor_id = str(event.pgh_context.get("user"))
        return {
            "id": event.pgh_slug,
            "occurred_at": event.pgh_created_at.isoformat().replace("+00:00", "Z"),
            "actor_id": actor_id,
            "actor_name": self.people.get(actor_id, ""),
            "action": event.pgh_label,
            "object_type": OBJECT_TYPES[event.pgh_obj_model],
            "object_id": str(event.pgh_obj_id),
            "object_label": self._label(event.pgh_obj_model, event.pgh_data),
            "changes": [
                self._change(field, before, after)
                for field, (before, after) in sorted((event.pgh_diff or {}).items())
            ]
            if event.pgh_label in CHANGE_LABELS
            else [],
        }

    def _label(self, model: str, data: dict[str, Any]) -> str:
        if model == "compliance.Implementation":
            citation = self.citations.get(data["requirement_id"], data["requirement_id"])
            return f"{citation} · {self.scopes.get(data['scope_id'], '')}"
        if model == "compliance.TenantMapping":
            target = self.citations.get(data["target_requirement_id"], "")
            return f"{target} ← {self.citations.get(data['source_requirement_id'], '')}"
        return str(data.get("title") or data.get("title_de") or data.get("name") or "")

    def _change(self, field: str, before: Any, after: Any) -> dict[str, Any]:
        if field == "owner_id":
            return {"field": "owner", "from": self._person(before), "to": self._person(after)}
        return {"field": field, "from": _text(before), "to": _text(after)}

    def _person(self, user_id: Any) -> str | None:
        return None if user_id is None else self.people.get(str(user_id), str(user_id))


def _text(value: Any) -> str | None:
    return None if value in (None, "") else str(value)


def _encode(event: Any) -> str:
    raw = f"{event.pgh_created_at.isoformat()}|{event.pgh_slug}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode(cursor: str) -> tuple[datetime, str]:
    # The cursor names the last entry seen, not a position: entries keep arriving at the
    # top, and a position would shift under the reader and repeat rows.
    try:
        occurred, slug = base64.urlsafe_b64decode(cursor.encode()).decode().split("|", 1)
        return datetime.fromisoformat(occurred), slug
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise Problem(
            status.HTTP_400_BAD_REQUEST, "invalid_cursor", "The cursor is not valid."
        ) from None
