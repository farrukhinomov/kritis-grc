"""Read access to the legal catalogue and the Mappings a Tenant sees."""

from typing import Any

from django.db.models import Q, QuerySet

from grc.compliance.models import Framework, PlatformMapping, Requirement, TenantMapping
from grc.core.actor import Actor


def frameworks() -> QuerySet[Framework]:
    return Framework.objects.prefetch_related("versions").order_by("position", "id")


def present_framework(framework: Framework) -> dict[str, Any]:
    return {
        "id": framework.id,
        "key": framework.key,
        "name": framework.name,
        "versions": [
            {
                "id": v.id,
                "label": v.label,
                "effective_from": v.effective_from.isoformat(),
                "source_url": v.source_url,
                "retrieved_at": v.retrieved_at.isoformat(),
            }
            for v in sorted(framework.versions.all(), key=lambda v: v.effective_from)
        ],
    }


def requirements(
    *, framework_version: str | None = None, paragraph: str | None = None, search: str | None = None
) -> QuerySet[Requirement]:
    items = Requirement.objects.all()
    if framework_version is not None:
        items = items.filter(framework_version_id=framework_version)
    if paragraph is not None:
        items = items.filter(paragraph=paragraph)
    if search:
        items = items.filter(
            Q(citation__icontains=search)
            | Q(title_de__icontains=search)
            | Q(title_en__icontains=search)
        )
    return items


def present_requirement(requirement: Requirement) -> dict[str, Any]:
    pending = (
        {"reason_de": requirement.pending_reason_de, "reason_en": requirement.pending_reason_en}
        if requirement.pending_reason_de
        else None
    )
    return {
        "id": requirement.id,
        "framework_version_id": requirement.framework_version_id,
        "paragraph": requirement.paragraph,
        "citation": requirement.citation,
        "title_de": requirement.title_de,
        "title_en": requirement.title_en,
        "text_de": requirement.text_de,
        "summary_en": requirement.summary_en,
        "pending_legal_detail": pending,
    }


def mappings(
    actor: Actor, *, target: str | None = None, source: str | None = None
) -> list[dict[str, Any]]:
    """Platform Mappings, then the Tenant's own approved ones; never other Tenants'."""
    platform = PlatformMapping.objects.order_by("id")
    own = TenantMapping.objects.filter(approved_at__isnull=False).order_by("approved_at", "id")
    if target is not None:
        platform = platform.filter(target_requirement_id=target)
        own = own.filter(target_requirement_id=target)
    if source is not None:
        platform = platform.filter(source_requirement_id=source)
        own = own.filter(source_requirement_id=source)
    return [_present_platform(m) for m in platform] + [_present_own(m) for m in own]


def _present_platform(mapping: PlatformMapping) -> dict[str, Any]:
    return {
        "id": mapping.id,
        "kind": "platform",
        "target_requirement_id": mapping.target_requirement_id,
        "source_requirement_id": mapping.source_requirement_id,
        "coverage": mapping.coverage,
        "justification_de": mapping.justification_de,
        "gap_note_de": mapping.gap_note_de or None,
        "approved_by_id": None,
        "approved_at": None,
    }


def _present_own(mapping: TenantMapping) -> dict[str, Any]:
    return {
        "id": str(mapping.id),
        "kind": "tenant",
        "target_requirement_id": mapping.target_requirement_id,
        "source_requirement_id": mapping.source_requirement_id,
        "coverage": mapping.coverage,
        "justification_de": mapping.justification_de,
        "gap_note_de": mapping.gap_note_de or None,
        "approved_by_id": str(mapping.approved_by_id) if mapping.approved_by_id else None,
        "approved_at": mapping.approved_at.isoformat() if mapping.approved_at else None,
    }
