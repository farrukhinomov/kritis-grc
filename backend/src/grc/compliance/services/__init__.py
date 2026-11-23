"""Loading the legal catalogue and a Tenant's own Mappings.

Loading is idempotent: rows are matched by their catalogue identifiers and updated in
place, so running it again changes nothing and keeps every reference valid.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

from grc.compliance.models import (
    Evidence,
    Framework,
    FrameworkVersion,
    Implementation,
    MappingSuggestion,
    ModelCall,
    PlatformMapping,
    Requirement,
    TenantMapping,
    Upload,
)
from grc.core.purge import purge_rows


def load_catalogue(
    frameworks: list[dict[str, Any]],
    requirements: list[dict[str, Any]],
    platform_mappings: list[dict[str, Any]],
) -> None:
    for position, framework in enumerate(frameworks):
        Framework.objects.update_or_create(
            id=framework["id"],
            defaults={"key": framework["key"], "name": framework["name"], "position": position},
        )
        for version in framework["versions"]:
            FrameworkVersion.objects.update_or_create(
                id=version["id"],
                defaults={
                    "framework_id": framework["id"],
                    "label": version["label"],
                    "effective_from": date.fromisoformat(version["effective_from"]),
                    "source_url": version["source_url"],
                    "retrieved_at": date.fromisoformat(version["retrieved_at"]),
                },
            )
    for position, requirement in enumerate(requirements):
        pending = requirement.get("pending_legal_detail") or {}
        Requirement.objects.update_or_create(
            id=requirement["id"],
            defaults={
                "framework_version_id": requirement["framework_version_id"],
                "paragraph": requirement["paragraph"],
                "citation": requirement["citation"],
                "title_de": requirement["title_de"],
                "title_en": requirement["title_en"],
                "text_de": requirement["text_de"],
                "summary_en": requirement["summary_en"],
                "pending_reason_de": pending.get("reason_de", ""),
                "pending_reason_en": pending.get("reason_en", ""),
                "position": position,
            },
        )
    for mapping in platform_mappings:
        PlatformMapping.objects.update_or_create(
            id=mapping["id"],
            defaults=_mapping_fields(mapping),
        )


def load_tenant_mappings(
    mappings: list[dict[str, Any]], ids: dict[str, UUID], users: dict[str, int]
) -> None:
    """Loads approved Tenant Mappings into the active Tenant under stable identifiers."""
    for mapping in mappings:
        approved_by = mapping.get("approved_by_id")
        approved_at = mapping.get("approved_at")
        TenantMapping.objects.update_or_create(
            id=ids[mapping["id"]],
            defaults={
                **_mapping_fields(mapping),
                "approved_by_id": users[approved_by] if approved_by else None,
                "approved_at": datetime.fromisoformat(approved_at) if approved_at else None,
            },
        )


def _mapping_fields(mapping: dict[str, Any]) -> dict[str, Any]:
    return {
        "target_requirement_id": mapping["target_requirement_id"],
        "source_requirement_id": mapping["source_requirement_id"],
        "coverage": mapping["coverage"],
        "justification_de": mapping["justification_de"],
        "gap_note_de": mapping.get("gap_note_de") or "",
    }


def purge_tenant_data() -> int:
    """Removes the active Tenant's compliance work, for the Demo Tenant reset.

    The stored files go separately, after the transaction commits: a rolled-back reset
    must not have deleted them.
    """
    return purge_rows(
        [Evidence, Upload, Implementation, MappingSuggestion, TenantMapping, ModelCall]
    )
