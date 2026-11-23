"""Reading Implementations and the compliance aggregates built from them."""

import re
from collections import defaultdict
from typing import Any
from uuid import UUID

from django.db.models import F, QuerySet
from rest_framework import status

from grc.compliance.models import (
    Evidence,
    EvidenceKind,
    Implementation,
    ImplementationStatus,
    Requirement,
)
from grc.core.actor import Actor
from grc.core.ids import uuid_or_none
from grc.core.problems import Problem
from grc.core.text import compact, fold

ORDERINGS = {
    "due_date": ("due_date",),
    "-due_date": ("-due_date",),
    "updated_at": ("updated_at",),
    "-updated_at": ("-updated_at",),
}


def implementations(
    actor: Actor,
    *,
    scope: str | None = None,
    requirement: str | None = None,
    owner: str | None = None,
    framework_version: str | None = None,
    paragraph: str | None = None,
    statuses: str | None = None,
    ordering: str | None = None,
) -> QuerySet[Implementation]:
    items = Implementation.objects.select_related("owner", "requirement")
    if actor.scope_ids is not None:
        items = items.filter(scope_id__in=actor.scope_ids)
    if scope is not None:
        items = items.filter(scope_id=uuid_or_none(scope))
    if requirement is not None:
        items = items.filter(requirement_id=requirement)
    if owner is not None:
        items = items.filter(owner_id=int(owner) if owner.isdigit() else None)
    if framework_version is not None:
        items = items.filter(requirement__framework_version_id=framework_version)
    if paragraph is not None:
        items = items.filter(requirement__paragraph=paragraph)
    if statuses:
        wanted = statuses.split(",")
        if any(s not in ImplementationStatus.values for s in wanted):
            raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_filter", "Unknown status.")
        items = items.filter(status__in=wanted)
    if ordering is not None:
        if ordering not in ORDERINGS:
            raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_ordering", "Unknown ordering.")
        # Undated work sorts after dated work either way, as "no deadline" isn't urgent.
        field = ORDERINGS[ordering][0]
        name = field.lstrip("-")
        expression = (
            F(name).desc(nulls_last=True) if field.startswith("-") else F(name).asc(nulls_last=True)
        )
        return items.order_by(expression, "requirement__position", "id")
    return items.order_by("requirement__position", "scope__name", "id")


def present_implementation(implementation: Implementation) -> dict[str, Any]:
    owner = implementation.owner
    return {
        "id": str(implementation.id),
        "requirement_id": implementation.requirement_id,
        "scope_id": str(implementation.scope_id),
        "status": implementation.status,
        "owner_id": str(owner.pk) if owner else None,
        "owner_name": (owner.display_name or owner.email) if owner else None,
        "due_date": implementation.due_date.isoformat() if implementation.due_date else None,
        "note_de": implementation.note_de or None,
        "version": implementation.version,
        "updated_at": implementation.updated_at.isoformat().replace("+00:00", "Z"),
    }


def _counts() -> dict[str, int]:
    return dict.fromkeys(ImplementationStatus.values, 0)


def compliance_summary(actor: Actor) -> dict[str, Any]:
    """Counts per Scope and Framework. An aggregate, never paged, so no row can go missing."""
    items = implementations(actor).select_related(
        "scope", "requirement__framework_version__framework"
    )
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    for item in items.order_by("scope__kind", "scope__name", "requirement__position"):
        framework = item.requirement.framework_version.framework
        key = (str(item.scope_id), framework.id)
        row = rows.setdefault(
            key,
            {
                "scope_id": str(item.scope_id),
                "scope_name": item.scope.name,
                "scope_kind": item.scope.kind,
                "framework_id": framework.id,
                "framework_name": framework.name,
                "counts": _counts(),
            },
        )
        row["counts"][item.status] += 1
    return {"rows": list(rows.values())}


def compliance_paragraphs(actor: Actor, framework_version: str, scope: str) -> dict[str, Any]:
    """Counts per paragraph of one Framework Version in one Scope, in statute order."""
    counts: dict[str, dict[str, int]] = defaultdict(_counts)
    for item in implementations(actor, framework_version=framework_version, scope=scope):
        counts[item.requirement.paragraph][item.status] += 1
    sizes: dict[str, int] = defaultdict(int)
    for paragraph in Requirement.objects.filter(framework_version_id=framework_version).values_list(
        "paragraph", flat=True
    ):
        sizes[paragraph] += 1
    return {
        "rows": [
            {"paragraph": p, "requirement_count": sizes[p], "counts": counts[p]}
            for p in sorted(counts, key=paragraph_order)
        ]
    }


def paragraph_order(paragraph: str) -> tuple[int, str]:
    """ "§ 8" before "§ 8a" before "§ 12": the number counts, a letter comes after it."""
    match = re.search(r"(\d+)\s*([a-z]*)", paragraph)
    return (int(match.group(1)), match.group(2)) if match else (0, paragraph)


def evidence_of(actor: Actor, implementation_id: UUID) -> QuerySet[Evidence] | None:
    """The Evidence of a visible Implementation, oldest first; None if it isn't visible."""
    if not implementations(actor).filter(id=implementation_id).exists():
        return None
    return Evidence.objects.filter(implementation_id=implementation_id).order_by("added_at", "id")


def present_evidence(evidence: Evidence) -> dict[str, Any]:
    is_file = evidence.kind == EvidenceKind.FILE
    return {
        "id": str(evidence.id),
        "implementation_id": str(evidence.implementation_id),
        "kind": evidence.kind,
        "title": evidence.title,
        "file": {
            "name": evidence.file_name,
            "size_bytes": evidence.file_size_bytes,
            "content_type": evidence.file_content_type,
        }
        if is_file
        else None,
        "url": evidence.url or None,
        "referenced_implementation_id": str(evidence.referenced_implementation_id)
        if evidence.referenced_implementation_id
        else None,
        "added_by_id": str(evidence.added_by_id) if evidence.added_by_id else None,
        "added_at": evidence.added_at.isoformat().replace("+00:00", "Z"),
    }


def implementation_statuses(ids: set[UUID]) -> dict[UUID, str]:
    """The current status of each of the active Tenant's Implementations among `ids`.

    For recalculations that run for the Tenant as a whole, not for a person.
    """
    return dict(Implementation.objects.filter(id__in=ids).values_list("id", "status"))


def search_requirements(
    actor: Actor, query: str, *, limit: int
) -> tuple[list[dict[str, Any]], int]:
    """Requirements the actor's Scopes apply, best match first, with where to open each.

    Only applied Requirements are found, so every hit opens somewhere in the cockpit,
    preferably at a Critical Facility, which the cockpit lists first. A citation match
    ranks before a title match, a title match before one in the statute text; a query
    without a digit is never taken for a citation, or "§." would match every one.
    """
    needle, citation = fold(query), compact(query)
    citation_needle = citation if any(c.isdigit() for c in citation) else None
    applying: dict[str, tuple[bool, UUID]] = {}
    for requirement_id, scope_id, kind in implementations(actor).values_list(
        "requirement_id", "scope_id", "scope__kind"
    ):
        facility = kind == "critical_facility"
        if requirement_id not in applying or (facility and not applying[requirement_id][0]):
            applying[requirement_id] = (facility, scope_id)
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for requirement in Requirement.objects.filter(id__in=applying).select_related(
        "framework_version__framework"
    ):
        if citation_needle is not None and citation_needle in compact(requirement.citation):
            rank = 0
        elif needle in fold(f"{requirement.title_de} {requirement.title_en}"):
            rank = 1
        elif needle in fold(f"{requirement.text_de} {requirement.summary_en}"):
            rank = 2
        else:
            continue
        framework = requirement.framework_version.framework
        ranked.append(
            (
                rank,
                requirement.position,
                {
                    "id": requirement.id,
                    "citation": requirement.citation,
                    "title_de": requirement.title_de,
                    "title_en": requirement.title_en,
                    "framework_id": framework.id,
                    "framework_name": framework.name,
                    "paragraph": requirement.paragraph,
                    "scope_id": str(applying[requirement.id][1]),
                },
            )
        )
    ranked.sort(key=lambda hit: (hit[0], hit[1]))
    return [hit for _, _, hit in ranked[:limit]], len(ranked)
