"""The Hazard catalogue and Risks of a Tenant."""

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.risk import selectors
from grc.risk.models import HazardCategory


class HazardOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    category = serializers.ChoiceField(choices=HazardCategory.choices)
    name_de = serializers.CharField()
    name_en = serializers.CharField()
    description_de = serializers.CharField()


class HazardsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="hazards_list",
        summary="The Tenant's Hazard catalogue",
        responses={200: page_schema("Hazard", HazardOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        page = page_of(request, selectors.hazards())
        page["items"] = [selectors.present_hazard(h) for h in page["items"]]
        return Response(page)
