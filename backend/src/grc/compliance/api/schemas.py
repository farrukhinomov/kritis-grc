"""Response shapes for the API reference. The views build plain dicts in these shapes."""

from typing import Any

from drf_spectacular.utils import inline_serializer
from rest_framework import serializers

from grc.compliance.models import Coverage, EvidenceKind, FrameworkKey, ImplementationStatus


class FrameworkVersionOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    # A field called "label" shadows the serializer's own attribute of that name.
    label = serializers.CharField()  # type: ignore[assignment]
    effective_from = serializers.DateField()
    source_url = serializers.URLField()
    retrieved_at = serializers.DateField()


class FrameworkOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    key = serializers.ChoiceField(choices=FrameworkKey.choices)
    name = serializers.CharField()
    versions = FrameworkVersionOut(many=True)


class PendingLegalDetailOut(serializers.Serializer[Any]):
    reason_de = serializers.CharField()
    reason_en = serializers.CharField()


class RequirementOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    framework_version_id = serializers.CharField()
    paragraph = serializers.CharField()
    citation = serializers.CharField()
    title_de = serializers.CharField()
    title_en = serializers.CharField()
    text_de = serializers.CharField()
    summary_en = serializers.CharField()
    pending_legal_detail = PendingLegalDetailOut(allow_null=True)


class MappingOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=[("platform", "platform"), ("tenant", "tenant")])
    target_requirement_id = serializers.CharField()
    source_requirement_id = serializers.CharField()
    coverage = serializers.ChoiceField(choices=Coverage.choices)
    justification_de = serializers.CharField()
    gap_note_de = serializers.CharField(allow_null=True)
    approved_by_id = serializers.CharField(allow_null=True)
    approved_at = serializers.DateTimeField(allow_null=True)


class ImplementationOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    requirement_id = serializers.CharField()
    scope_id = serializers.CharField()
    status = serializers.ChoiceField(choices=ImplementationStatus.choices)
    owner_id = serializers.CharField(allow_null=True)
    owner_name = serializers.CharField(allow_null=True)
    due_date = serializers.DateField(allow_null=True)
    note_de = serializers.CharField(allow_null=True)
    version = serializers.IntegerField()
    updated_at = serializers.DateTimeField()


# A serializer can't declare a field called "partial" (it is the serializer's own flag),
# so the counts are described inline.
StatusCountsOut = inline_serializer(
    "StatusCounts", {status: serializers.IntegerField() for status in ImplementationStatus.values}
)


class ComplianceSummaryRowOut(serializers.Serializer[Any]):
    scope_id = serializers.CharField()
    scope_name = serializers.CharField()
    scope_kind = serializers.CharField()
    framework_id = serializers.CharField()
    framework_name = serializers.CharField()
    counts = StatusCountsOut


class ComplianceSummaryOut(serializers.Serializer[Any]):
    rows = ComplianceSummaryRowOut(many=True)


class ParagraphSummaryRowOut(serializers.Serializer[Any]):
    paragraph = serializers.CharField()
    requirement_count = serializers.IntegerField()
    counts = StatusCountsOut


class ParagraphSummaryOut(serializers.Serializer[Any]):
    rows = ParagraphSummaryRowOut(many=True)


class EvidenceFileOut(serializers.Serializer[Any]):
    name = serializers.CharField()
    size_bytes = serializers.IntegerField()
    content_type = serializers.CharField()


class EvidenceOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    implementation_id = serializers.CharField()
    kind = serializers.ChoiceField(choices=EvidenceKind.choices)
    title = serializers.CharField()
    file = EvidenceFileOut(allow_null=True)
    url = serializers.URLField(allow_null=True)
    referenced_implementation_id = serializers.CharField(allow_null=True)
    added_by_id = serializers.CharField(allow_null=True)
    added_at = serializers.DateTimeField()


class UploadSlotOut(serializers.Serializer[Any]):
    upload_id = serializers.CharField()
    upload_url = serializers.URLField()
    expires_at = serializers.DateTimeField()
