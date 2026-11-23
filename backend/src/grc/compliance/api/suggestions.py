"""Mapping Suggestions: reading them and deciding them."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance.api.schemas import MappingOut
from grc.compliance.models import Coverage, SuggestionStatus
from grc.compliance.selectors import present_tenant_mapping
from grc.compliance.selectors import suggestions as selectors
from grc.compliance.services import suggestions as services
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema


class RequirementRefOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    citation = serializers.CharField()
    title_de = serializers.CharField()
    title_en = serializers.CharField()
    framework_name = serializers.CharField()


class MappingSuggestionOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    target_requirement_id = serializers.CharField()
    source_requirement_id = serializers.CharField()
    target = RequirementRefOut()
    # A field called "source" shadows the serializer's own attribute of that name.
    source = RequirementRefOut()  # type: ignore[assignment]
    coverage = serializers.ChoiceField(choices=Coverage.choices)
    confidence = serializers.FloatField(
        min_value=0, max_value=1, help_text="The model's own estimate; a hint, never proof."
    )
    rationale_de = serializers.CharField()
    rationale_en = serializers.CharField()
    status = serializers.ChoiceField(choices=SuggestionStatus.choices)
    model = serializers.CharField()
    created_at = serializers.DateTimeField()
    decided_by_id = serializers.CharField(allow_null=True)
    decided_by_name = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)


class MappingSuggestionsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="mapping_suggestions_list",
        summary="Mapping Suggestions, pending ones first in statute order",
        responses={200: page_schema("MappingSuggestion", MappingSuggestionOut())},
        parameters=[
            OpenApiParameter(
                "status", str, required=False, description="pending, approved or rejected."
            )
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        items = selectors.suggestions(status_filter=request.query_params.get("status"))
        page = page_of(request, items)
        page["items"] = [selectors.present_suggestion(s) for s in page["items"]]
        return Response(page)


class ApproveMappingSuggestionView(TenantScopedAPIView):
    @extend_schema(
        operation_id="mapping_suggestions_approve",
        summary="Approve a suggestion, which creates the Tenant Mapping",
        request=None,
        responses={201: MappingOut},
    )
    def post(self, request: Request, tenant_slug: str, suggestion_id: UUID) -> Response:
        mapping = services.approve(self.actor, suggestion_id)
        return Response(present_tenant_mapping(mapping), status=status.HTTP_201_CREATED)


class RejectMappingSuggestionView(TenantScopedAPIView):
    @extend_schema(
        operation_id="mapping_suggestions_reject",
        summary="Reject a suggestion",
        request=None,
        responses=MappingSuggestionOut,
    )
    def post(self, request: Request, tenant_slug: str, suggestion_id: UUID) -> Response:
        services.reject(self.actor, suggestion_id)
        fresh = selectors.suggestions().get(id=suggestion_id)
        return Response(selectors.present_suggestion(fresh))
