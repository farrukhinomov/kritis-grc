"""The coverage matrix: where the BSIG already covers the KRITIS-Dachgesetz."""

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance.models import Coverage, FrameworkKey
from grc.compliance.selectors.coverage import coverage_matrix
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView


class CoverageRequirementOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    citation = serializers.CharField()
    paragraph = serializers.CharField()
    title_de = serializers.CharField()
    title_en = serializers.CharField()
    framework_key = serializers.ChoiceField(choices=FrameworkKey.choices)
    framework_name = serializers.CharField()


class CoverageMappingOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    kind = serializers.ChoiceField(choices=[("platform", "platform"), ("tenant", "tenant")])
    coverage = serializers.ChoiceField(choices=Coverage.choices)
    justification_de = serializers.CharField()
    gap_note_de = serializers.CharField(allow_null=True)


class ReusedInOut(serializers.Serializer[Any]):
    scope_id = serializers.UUIDField()
    scope_name = serializers.CharField()


class CoverageCellOut(serializers.Serializer[Any]):
    target_requirement_id = serializers.CharField()
    source_requirement_id = serializers.CharField()
    coverage = serializers.ChoiceField(choices=Coverage.choices, help_text="The strongest Mapping.")
    mappings = CoverageMappingOut(many=True)
    reused_in = ReusedInOut(
        many=True, help_text="Facilities whose Implementation refers to the source's as Evidence."
    )


class CoverageTotalsOut(serializers.Serializer[Any]):
    cells = serializers.IntegerField()
    full = serializers.IntegerField()
    # A field called "partial" shadows the serializer's own attribute of that name.
    partial = serializers.IntegerField()  # type: ignore[assignment]
    reused = serializers.IntegerField()


class CoverageMatrixOut(serializers.Serializer[Any]):
    rows = CoverageRequirementOut(many=True)
    columns = CoverageRequirementOut(many=True)
    cells = CoverageCellOut(many=True)
    totals = CoverageTotalsOut()


class CoverageMatrixView(TenantScopedAPIView):
    @extend_schema(
        operation_id="coverage_matrix_retrieve",
        summary="KRITIS-DachG Requirements by BSIG Requirements, with their Mappings and reuse",
        description="One aggregate, never paged: only the pairs with an applying Mapping.",
        responses=CoverageMatrixOut,
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        return Response(coverage_matrix(self.actor))
