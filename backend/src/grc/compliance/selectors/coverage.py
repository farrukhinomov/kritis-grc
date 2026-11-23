"""Where the BSIG already covers the KRITIS-Dachgesetz, as a grid of Requirement pairs.

A cell holds every Mapping between its two Requirements that applies to the Tenant: the
Platform's, and the Tenant's own once approved. It is rated by its strongest Mapping.
One Implementation counts for both only where a full Mapping applies and the facility's
Implementation refers to an implemented BSIG one as Evidence: a partial Mapping leaves
part of the duty uncovered, and unfinished work proves nothing.
"""

from collections import defaultdict
from typing import Any

from grc.compliance.models import (
    Coverage,
    Evidence,
    EvidenceKind,
    FrameworkKey,
    FrameworkVersion,
    ImplementationStatus,
    PlatformMapping,
    Requirement,
    TenantMapping,
)
from grc.core.actor import Actor


def coverage_matrix(actor: Actor) -> dict[str, Any]:
    rows = _requirements(FrameworkKey.KRITIS_DACHG)
    columns = _requirements(FrameworkKey.BSIG)
    pairs: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    # The Tenant's own judgement first, then the Platform's; within each, full first.
    for mapping in TenantMapping.objects.filter(approved_at__isnull=False).order_by("id"):
        pairs[mapping.target_requirement_id, mapping.source_requirement_id].append(
            _mapping(str(mapping.id), "tenant", mapping)
        )
    for platform in PlatformMapping.objects.order_by("id"):
        pairs[platform.target_requirement_id, platform.source_requirement_id].append(
            _mapping(platform.id, "platform", platform)
        )
    reused = _reuse(actor)
    cells = []
    for row in rows:
        for column in columns:
            mappings = pairs.get((row["id"], column["id"]))
            if not mappings:
                continue
            mappings.sort(key=lambda m: (m["kind"] != "tenant", m["coverage"] != Coverage.FULL))
            full = any(m["coverage"] == Coverage.FULL for m in mappings)
            cells.append(
                {
                    "target_requirement_id": row["id"],
                    "source_requirement_id": column["id"],
                    "coverage": Coverage.FULL if full else Coverage.PARTIAL,
                    "mappings": mappings,
                    "reused_in": sorted(
                        reused.get((row["id"], column["id"]), []) if full else [],
                        key=lambda scope: (scope["scope_name"], scope["scope_id"]),
                    ),
                }
            )
    return {
        "rows": rows,
        "columns": columns,
        "cells": cells,
        "totals": {
            "cells": len(cells),
            "full": sum(c["coverage"] == Coverage.FULL for c in cells),
            "partial": sum(c["coverage"] == Coverage.PARTIAL for c in cells),
            "reused": sum(bool(c["reused_in"]) for c in cells),
        },
    }


def _requirements(key: str) -> list[dict[str, Any]]:
    # The version in force: the latest to have taken effect.
    version = (
        FrameworkVersion.objects.filter(framework__key=key)
        .select_related("framework")
        .order_by("-effective_from")
        .first()
    )
    if version is None:
        return []
    return [
        {
            "id": r.id,
            "citation": r.citation,
            "paragraph": r.paragraph,
            "title_de": r.title_de,
            "title_en": r.title_en,
            "framework_key": key,
            "framework_name": version.framework.name,
        }
        # The catalogue's position is the statute's order ("Nr. 10" after "Nr. 9").
        for r in Requirement.objects.filter(framework_version=version).order_by("position")
    ]


def _mapping(mapping_id: str, kind: str, mapping: Any) -> dict[str, Any]:
    return {
        "id": mapping_id,
        "kind": kind,
        "coverage": mapping.coverage,
        "justification_de": mapping.justification_de,
        "gap_note_de": mapping.gap_note_de or None,
    }


def _reuse(actor: Actor) -> dict[tuple[str, str], list[dict[str, str]]]:
    """For each (target, source) pair: the visible Scopes whose target Implementation
    refers to an implemented source Implementation as Evidence."""
    references = Evidence.objects.filter(
        kind=EvidenceKind.REFERENCE,
        referenced_implementation__status=ImplementationStatus.IMPLEMENTED,
    )
    if actor.scope_ids is not None:
        references = references.filter(implementation__scope_id__in=actor.scope_ids)
    found: dict[tuple[str, str], list[dict[str, str]]] = defaultdict(list)
    seen: set[tuple[str, str, str]] = set()
    for target, source, scope_id, scope_name in references.values_list(
        "implementation__requirement_id",
        "referenced_implementation__requirement_id",
        "implementation__scope_id",
        "implementation__scope__name",
    ):
        if (target, source, str(scope_id)) in seen:
            continue
        seen.add((target, source, str(scope_id)))
        found[target, source].append({"scope_id": str(scope_id), "scope_name": scope_name})
    return found
