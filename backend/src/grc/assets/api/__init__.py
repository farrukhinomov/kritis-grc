"""Assets of the Scopes the actor may see."""

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from grc.assets import selectors
from grc.assets.models import AssetKind, Criticality
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema


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
