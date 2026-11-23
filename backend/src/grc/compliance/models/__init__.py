"""Frameworks, their Requirements and the Mappings between them.

The legal content is platform-wide: every Tenant reads the same Requirements and the
same curated Platform Mappings, and none can change them. Its identifiers are the
stable ones from the published catalogue, so references stay valid when the catalogue
or a Demo Tenant is loaded again. Tenant Mappings belong to one Tenant and count once
its GRC Manager approved them.
"""

import uuid
from typing import ClassVar

import pghistory
from django.conf import settings
from django.db import models
from django.utils import timezone

from grc.core.history import tracked
from grc.core.models import TenantOwnedModel

CATALOGUE_ID_LENGTH = 64


class FrameworkKey(models.TextChoices):
    KRITIS_DACHG = "kritis_dachg", "KRITIS-Dachgesetz"
    BSIG = "bsig", "NIS2 (BSIG 2025)"


class Coverage(models.TextChoices):
    FULL = "full", "full"
    PARTIAL = "partial", "partial"


class Framework(models.Model):
    id = models.CharField(primary_key=True, max_length=CATALOGUE_ID_LENGTH)
    key = models.CharField(max_length=32, choices=FrameworkKey.choices, unique=True)
    name = models.CharField(max_length=200)
    position = models.PositiveSmallIntegerField(default=0)

    def __str__(self) -> str:
        return self.name


class FrameworkVersion(models.Model):
    id = models.CharField(primary_key=True, max_length=CATALOGUE_ID_LENGTH)
    framework = models.ForeignKey(Framework, on_delete=models.PROTECT, related_name="versions")
    label = models.CharField(max_length=200)
    effective_from = models.DateField()
    source_url = models.URLField()
    retrieved_at = models.DateField()

    def __str__(self) -> str:
        return f"{self.framework_id} {self.label}"


class Requirement(models.Model):
    id = models.CharField(primary_key=True, max_length=CATALOGUE_ID_LENGTH)
    framework_version = models.ForeignKey(
        FrameworkVersion, on_delete=models.PROTECT, related_name="requirements"
    )
    paragraph = models.CharField(max_length=32)
    citation = models.CharField(max_length=64)
    title_de = models.CharField(max_length=300)
    title_en = models.CharField(max_length=300)
    # The statute's own words, shown in German in every interface language.
    text_de = models.TextField()
    summary_en = models.TextField()
    # Set while the obligation's specifics still await an ordinance or template.
    pending_reason_de = models.TextField(blank=True)
    pending_reason_en = models.TextField(blank=True)
    # The catalogue's order: Frameworks as published, each in the order of its statute,
    # which sorting by citation text can't reproduce ("§ 8a" after "§ 8", "Nr. 10" last).
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar = ["position"]

    def __str__(self) -> str:
        return self.citation


class PlatformMapping(models.Model):
    """Curated with a legal justification; the same for, and read-only to, every Tenant."""

    id = models.CharField(primary_key=True, max_length=CATALOGUE_ID_LENGTH)
    target_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    source_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    coverage = models.CharField(max_length=16, choices=Coverage.choices)
    justification_de = models.TextField()
    gap_note_de = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.target_requirement_id} <- {self.source_requirement_id}"


@tracked()
class TenantMapping(TenantOwnedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    source_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    coverage = models.CharField(max_length=16, choices=Coverage.choices)
    justification_de = models.TextField()
    gap_note_de = models.TextField(blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    approved_at = models.DateTimeField(null=True)

    def __str__(self) -> str:
        return f"{self.target_requirement_id} <- {self.source_requirement_id}"


class ImplementationStatus(models.TextChoices):
    OPEN = "open", "open"
    PARTIAL = "partial", "partial"
    IMPLEMENTED = "implemented", "implemented"
    NOT_APPLICABLE = "not_applicable", "not applicable"


# The version and timestamp move with every change; they are not changes themselves.
@tracked(exclude=["version", "updated_at"])
class Implementation(TenantOwnedModel):
    """One Requirement applied to one Scope. Evidence attaches here, never to Requirements."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    scope = models.ForeignKey("organization.Scope", on_delete=models.CASCADE, related_name="+")
    status = models.CharField(
        max_length=16, choices=ImplementationStatus.choices, default=ImplementationStatus.OPEN
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    due_date = models.DateField(null=True)
    note_de = models.TextField(blank=True)
    # Sent to clients as the ETag; a write based on an older version is refused.
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField()

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["requirement", "scope"], name="one_implementation_per_scope"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.requirement_id} in {self.scope_id}"


class EvidenceKind(models.TextChoices):
    FILE = "file", "file"
    LINK = "link", "link"
    REFERENCE = "reference", "reference"


class Upload(TenantOwnedModel):
    """A file a member announced and may PUT to storage once, before it is Evidence."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    name = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=128)
    key = models.CharField(max_length=300, unique=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name


# The storage key is plumbing, not something a reader of the log needs.
@tracked(exclude=["file_key"])
class Evidence(TenantOwnedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    implementation = models.ForeignKey(
        Implementation, on_delete=models.CASCADE, related_name="evidence"
    )
    kind = models.CharField(max_length=16, choices=EvidenceKind.choices)
    title = models.CharField(max_length=200)
    file_name = models.CharField(max_length=255, blank=True)
    file_size_bytes = models.PositiveBigIntegerField(null=True)
    file_content_type = models.CharField(max_length=128, blank=True)
    file_key = models.CharField(max_length=300, blank=True)
    url = models.URLField(max_length=2000, blank=True)
    referenced_implementation = models.ForeignKey(
        Implementation, on_delete=models.CASCADE, null=True, related_name="+"
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    added_at = models.DateTimeField()

    def __str__(self) -> str:
        return self.title


class SuggestionStatus(models.TextChoices):
    PENDING = "pending", "pending"
    APPROVED = "approved", "approved"
    REJECTED = "rejected", "rejected"


def _decided(status: str) -> pghistory.UpdateEvent:
    return pghistory.UpdateEvent(
        status,
        condition=pghistory.Q(old__status=SuggestionStatus.PENDING, new__status=status),
    )


# A suggestion is never edited, only decided; who decided and when are the event's own
# actor and time, so those columns aren't copied.
@tracked(
    exclude=["decided_by", "decided_at"],
    events=[
        pghistory.InsertEvent("created"),
        _decided(SuggestionStatus.APPROVED),
        _decided(SuggestionStatus.REJECTED),
        pghistory.DeleteEvent("deleted"),
    ],
)
class MappingSuggestion(TenantOwnedModel):
    """A Tenant Mapping proposed by the AI, waiting for a GRC Manager's decision.

    Only public statute text went into it, so it carries nothing about the Tenant; it
    becomes a Tenant Mapping only when someone approves it.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    target_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    source_requirement = models.ForeignKey(Requirement, on_delete=models.PROTECT, related_name="+")
    coverage = models.CharField(max_length=16, choices=Coverage.choices)
    confidence = models.DecimalField(max_digits=3, decimal_places=2)
    rationale_de = models.TextField()
    rationale_en = models.TextField()
    model = models.CharField(max_length=64)
    status = models.CharField(
        max_length=16, choices=SuggestionStatus.choices, default=SuggestionStatus.PENDING
    )
    created_at = models.DateTimeField(default=timezone.now)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True)

    class Meta:
        constraints: ClassVar = [
            # Asking the model again must not pile up the same proposal.
            models.UniqueConstraint(
                fields=["tenant", "target_requirement", "source_requirement"],
                name="one_suggestion_per_pair",
            ),
            models.CheckConstraint(
                condition=models.Q(confidence__gte=0, confidence__lte=1),
                name="suggestion_confidence_is_a_share",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(status="pending", decided_by__isnull=True, decided_at__isnull=True)
                    | (
                        ~models.Q(status="pending")
                        & models.Q(decided_by__isnull=False, decided_at__isnull=False)
                    )
                ),
                name="suggestion_decided_when_not_pending",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.target_requirement_id} <- {self.source_requirement_id} ({self.status})"


class ModelCall(TenantOwnedModel):
    """One call to the LLM on behalf of a Tenant, counted against its daily cap.

    Recorded before the call, so failed and timed-out calls count too: they cost money.
    """

    purpose = models.CharField(max_length=64)
    called_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes: ClassVar = [
            models.Index(fields=["tenant", "called_at"], name="model_calls_by_day")
        ]

    def __str__(self) -> str:
        return f"{self.purpose} at {self.called_at}"
