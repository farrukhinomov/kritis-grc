"""Search behind the command palette, across the modules, inside one Tenant.

It runs on the server so the browser never loads whole lists to filter them. Each
module searches its own data within the actor's Scopes; this view only combines them.
"""

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from grc.assets.selectors import search_assets
from grc.compliance.selectors.implementations import search_requirements
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView
from grc.core.problems import Problem
from grc.risk.selectors import search_risks

MIN_LENGTH = 2
PER_GROUP = 5


class RequirementHitOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    citation = serializers.CharField()
    title_de = serializers.CharField()
    title_en = serializers.CharField()
    framework_id = serializers.CharField()
    framework_name = serializers.CharField()
    paragraph = serializers.CharField()
    scope_id = serializers.UUIDField(help_text="A Scope applying it, where the cockpit opens it.")


class RiskHitOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    title_de = serializers.CharField()
    scope_name = serializers.CharField()


class AssetHitOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    scope_id = serializers.UUIDField()
    scope_name = serializers.CharField()


class RequirementHitsOut(serializers.Serializer[Any]):
    items = RequirementHitOut(many=True)
    total = serializers.IntegerField()


class RiskHitsOut(serializers.Serializer[Any]):
    items = RiskHitOut(many=True)
    total = serializers.IntegerField()


class AssetHitsOut(serializers.Serializer[Any]):
    items = AssetHitOut(many=True)
    total = serializers.IntegerField()


class SearchResultsOut(serializers.Serializer[Any]):
    requirements = RequirementHitsOut()
    risks = RiskHitsOut()
    assets = AssetHitsOut()


class SearchView(TenantScopedAPIView):
    @extend_schema(
        operation_id="search_retrieve",
        summary="Requirements, Risks and Assets matching a query, best first",
        description=f"At most {PER_GROUP} per group, with how many matched in all.",
        responses=SearchResultsOut,
        parameters=[
            OpenApiParameter(
                "q", str, required=True, description=f"At least {MIN_LENGTH} characters."
            )
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = (request.query_params.get("q") or "").strip()
        if len(query) < MIN_LENGTH:
            raise Problem(
                status.HTTP_400_BAD_REQUEST,
                "invalid_filter",
                f"Search for at least {MIN_LENGTH} characters.",
            )
        groups = {
            "requirements": search_requirements(self.actor, query, limit=PER_GROUP),
            "risks": search_risks(self.actor, query, limit=PER_GROUP),
            "assets": search_assets(self.actor, query, limit=PER_GROUP),
        }
        return Response(
            {name: {"items": items, "total": total} for name, (items, total) in groups.items()}
        )
