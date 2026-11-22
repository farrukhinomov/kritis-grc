"""Response shapes for the API reference. The views build plain dicts in these shapes."""

from typing import Any

from rest_framework import serializers

from grc.compliance.models import Coverage, FrameworkKey


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
