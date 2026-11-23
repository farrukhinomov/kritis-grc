"""Asking the AI which BSIG Requirements cover each KRITIS-DachG Requirement.

One call per target that has no Mapping and was never suggested, each comparing it with
every BSIG Requirement. Only the public catalogue goes into a call. Every call counts
against the Tenant's daily cap before it is made, so a loop or a retry storm can't run
up costs. The calls run outside any database transaction: a model answer takes seconds,
and a pooled connection must not be held that long.
"""

import logging
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from django.conf import settings
from django.utils import timezone

from grc.compliance import suggester
from grc.compliance.models import (
    FrameworkKey,
    MappingSuggestion,
    ModelCall,
    PlatformMapping,
    Requirement,
    TenantMapping,
)
from grc.core.tenancy import tenant_transaction

logger = logging.getLogger(__name__)

PURPOSE = "mapping_suggestions"


@dataclass(frozen=True, slots=True)
class RunSummary:
    asked: int
    created: int
    declined: int
    stopped: str | None


def suggest_mappings(tenant_id: UUID, *, limit: int | None = None) -> RunSummary:
    candidates = [_public(r) for r in _framework(FrameworkKey.BSIG)]
    asked = created = declined = 0
    for target in _open_targets(tenant_id)[:limit]:
        with tenant_transaction(tenant_id):
            if _calls_today() >= settings.MAPPING_SUGGESTION_DAILY_CALLS:
                return RunSummary(asked, created, declined, "daily_cap")
            ModelCall.objects.create(purpose=PURPOSE)
        asked += 1
        try:
            generated = suggester.generate(_public(target), candidates)
        except suggester.SuggesterUnavailableError:
            return RunSummary(asked, created, declined, "unavailable")
        except suggester.SuggesterDeclinedError:
            declined += 1
            continue
        with tenant_transaction(tenant_id):
            created += _store(target, generated)
    summary = RunSummary(asked, created, declined, None)
    # "created" is a reserved LogRecord attribute, so the counts get names of their own.
    logger.info(
        "mapping suggestions run",
        extra={
            "tenant_id": str(tenant_id),
            "targets_asked": summary.asked,
            "suggestions_created": summary.created,
            "targets_declined": summary.declined,
        },
    )
    return summary


def _open_targets(tenant_id: UUID) -> list[Requirement]:
    with tenant_transaction(tenant_id):
        settled = (
            set(PlatformMapping.objects.values_list("target_requirement_id", flat=True))
            | set(TenantMapping.objects.values_list("target_requirement_id", flat=True))
            | set(MappingSuggestion.objects.values_list("target_requirement_id", flat=True))
        )
    return [r for r in _framework(FrameworkKey.KRITIS_DACHG) if r.id not in settled]


def _store(target: Requirement, generated: suggester.Generated) -> int:
    created = 0
    for item in generated.suggestions:
        _, new = MappingSuggestion.objects.get_or_create(
            target_requirement_id=target.id,
            source_requirement_id=item["source_requirement_id"],
            defaults={
                "coverage": item["coverage"],
                "confidence": Decimal(str(item["confidence"])),
                "rationale_de": item["rationale_de"],
                "rationale_en": item["rationale_en"],
                "model": generated.model,
            },
        )
        created += new
    return created


def _calls_today() -> int:
    start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    return ModelCall.objects.filter(purpose=PURPOSE, called_at__gte=start).count()


def _framework(key: str) -> list[Requirement]:
    return list(
        Requirement.objects.filter(framework_version__framework__key=key).order_by("position")
    )


def _public(requirement: Requirement) -> dict[str, str]:
    # Only these three fields of the public catalogue ever reach the model.
    return {"id": requirement.id, "citation": requirement.citation, "text": requirement.text_de}
