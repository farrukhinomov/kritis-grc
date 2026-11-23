"""Assets of the Scopes the actor may see."""

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.assets import selectors
from grc.assets.models import AssetKind, Criticality
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.core.ids import uuid_or_none
from grc.core.problems import Problem
from grc.risk.selectors import threats_by_asset


class AssetOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    scope_id = serializers.UUIDField()
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=AssetKind.choices)
    criticality = serializers.ChoiceField(choices=Criticality.choices)
    depends_on = serializers.ListField(child=serializers.UUIDField())
    description = serializers.CharField()


class AssetsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="assets_list",
        summary="Assets with what they depend on, by name",
        responses={200: page_schema("Asset", AssetOut())},
        parameters=[OpenApiParameter("scope", str, required=False, description="Only this Scope.")],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        page = page_of(
            request, selectors.assets(self.actor, scope=request.query_params.get("scope"))
        )
        page["items"] = [selectors.present_asset(a) for a in page["items"]]
        return Response(page)


class GraphRatingOut(serializers.Serializer[Any]):
    likelihood = serializers.IntegerField()
    impact = serializers.IntegerField()
    score = serializers.IntegerField()
    category = serializers.CharField()


class GraphRisksOut(serializers.Serializer[Any]):
    count = serializers.IntegerField()
    highest = GraphRatingOut(
        allow_null=True, help_text="Null without Risks, or while one is still pending."
    )


class GraphAssetOut(AssetOut):
    scope_name = serializers.CharField()
    risks = GraphRisksOut()


class GraphScopeOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    name = serializers.CharField()


class DependencyGraphOut(serializers.Serializer[Any]):
    scope = GraphScopeOut()
    roots = serializers.ListField(
        child=serializers.UUIDField(), help_text="The Assets nothing else of the facility needs."
    )
    assets = GraphAssetOut(many=True)


class DependencyGraphView(TenantScopedAPIView):
    @extend_schema(
        operation_id="dependency_graph_retrieve",
        summary="A Critical Facility's Assets and everything they depend on, with its Risks",
        description="One aggregate, never paged.",
        responses=DependencyGraphOut,
        parameters=[
            OpenApiParameter("scope", str, required=True, description="The Critical Facility.")
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        raw = request.query_params.get("scope")
        if raw is None:
            raise Problem(
                status.HTTP_400_BAD_REQUEST,
                "invalid_filter",
                "Name the Critical Facility in `scope`.",
            )
        scope_id = uuid_or_none(raw)
        graph = (
            selectors.dependency_graph(self.actor, scope_id, threats_by_asset(self.actor, scope_id))
            if scope_id is not None
            else None
        )
        if graph is None:
            raise NotFound
        return Response(graph)
