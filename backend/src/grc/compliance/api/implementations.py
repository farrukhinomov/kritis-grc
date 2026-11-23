"""Implementations and the compliance aggregates."""

import re
from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance.api.schemas import (
    ComplianceSummaryOut,
    ImplementationOut,
    ParagraphSummaryOut,
)
from grc.compliance.models import ImplementationStatus
from grc.compliance.selectors.implementations import (
    compliance_paragraphs,
    compliance_summary,
    implementations,
    present_implementation,
)
from grc.compliance.services.implementations import CHANGEABLE, change_implementation
from grc.core.actor import Permission
from grc.core.api import DateIn, TenantScopedAPIView, page_of, page_schema
from grc.core.problems import FieldProblem, Problem

_IF_MATCH = re.compile(r'^(?:W/)?"(\d+)"$')
MAX_NOTE = 2000


class ImplementationChangeIn(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=ImplementationStatus.choices, required=False)
    owner_id = serializers.CharField(allow_null=True, required=False)
    due_date = DateIn(allow_null=True, required=False)
    note_de = serializers.CharField(
        allow_null=True, allow_blank=True, max_length=MAX_NOTE, required=False
    )

    def validate_owner_id(self, value: str | None) -> int | None:
        if value is None:
            return None
        if not value.isdigit():
            raise serializers.ValidationError("Not a member.", code="invalid_choice")
        return int(value)


def _etag(version: int) -> dict[str, str]:
    return {"ETag": f'"{version}"'}


class ImplementationsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="implementations_list",
        summary="Implementations, filtered",
        parameters=[
            OpenApiParameter(name, str, required=False)
            for name in (
                "scope",
                "requirement",
                "owner",
                "framework_version",
                "paragraph",
                "status",
                "ordering",
            )
        ],
        responses={200: page_schema("Implementation", ImplementationOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        items = implementations(
            self.actor,
            scope=query.get("scope"),
            requirement=query.get("requirement"),
            owner=query.get("owner"),
            framework_version=query.get("framework_version"),
            paragraph=query.get("paragraph"),
            statuses=query.get("status"),
            ordering=query.get("ordering"),
        )
        page = page_of(request, items)
        page["items"] = [present_implementation(i) for i in page["items"]]
        return Response(page)


class ImplementationView(TenantScopedAPIView):
    @extend_schema(
        operation_id="implementations_retrieve",
        summary="One Implementation; its version is the ETag",
        responses=ImplementationOut,
    )
    def get(self, request: Request, tenant_slug: str, implementation_id: UUID) -> Response:
        self.actor.require(Permission.VIEW)
        item = implementations(self.actor).filter(id=implementation_id).first()
        if item is None:
            raise NotFound
        return Response(present_implementation(item), headers=_etag(item.version))

    @extend_schema(
        operation_id="implementations_partial_update",
        summary="Change status, owner, due date or note, based on a version",
        request=ImplementationChangeIn,
        parameters=[OpenApiParameter("If-Match", str, OpenApiParameter.HEADER, required=True)],
        responses=ImplementationOut,
    )
    def patch(self, request: Request, tenant_slug: str, implementation_id: UUID) -> Response:
        if not isinstance(request.data, dict):
            raise FieldProblem([{"field": "non_field_errors", "code": "invalid"}])
        unknown = [f for f in request.data if f not in CHANGEABLE]
        if unknown:
            raise FieldProblem([{"field": f, "code": "unknown_field"} for f in unknown])
        data = ImplementationChangeIn(data=request.data)
        data.is_valid(raise_exception=True)
        header = request.headers.get("If-Match", "").strip()
        match = _IF_MATCH.match(header)
        if header and not match:
            raise Problem(
                status.HTTP_400_BAD_REQUEST, "invalid_if_match", "If-Match must be a version."
            )
        item = change_implementation(
            self.actor,
            implementation_id,
            int(match.group(1)) if match else None,
            dict(data.validated_data),
        )
        item = implementations(self.actor).get(id=item.id)
        return Response(present_implementation(item), headers=_etag(item.version))


class ComplianceSummaryView(TenantScopedAPIView):
    @extend_schema(
        operation_id="compliance_summary",
        summary="Implementation counts per Scope and Framework",
        responses=ComplianceSummaryOut,
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        return Response(compliance_summary(self.actor))


class ComplianceParagraphsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="compliance_paragraphs",
        summary="Implementation counts per paragraph of one Framework Version in one Scope",
        parameters=[
            OpenApiParameter("framework_version", str, required=True),
            OpenApiParameter("scope", str, required=True),
        ],
        responses=ParagraphSummaryOut,
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        version = request.query_params.get("framework_version")
        scope = request.query_params.get("scope")
        if not version or not scope:
            raise Problem(
                status.HTTP_400_BAD_REQUEST,
                "missing_filter",
                "framework_version and scope are required.",
            )
        return Response(compliance_paragraphs(self.actor, version, scope))
