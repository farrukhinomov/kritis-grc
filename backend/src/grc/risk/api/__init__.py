"""The Hazard catalogue, Risks and the risk matrix of a Tenant."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.risk import selectors
from grc.risk.models import Dimension, HazardCategory, RiskCategory


class HazardOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    category = serializers.ChoiceField(choices=HazardCategory.choices)
    name_de = serializers.CharField()
    name_en = serializers.CharField()
    description_de = serializers.CharField()


class RatingOut(serializers.Serializer[Any]):
    likelihood = serializers.IntegerField(min_value=1, max_value=4)
    impact = serializers.IntegerField(min_value=1, max_value=4)
    score = serializers.IntegerField(min_value=1, max_value=16)
    category = serializers.ChoiceField(choices=RiskCategory.choices)


class TreatmentEffectOut(serializers.Serializer[Any]):
    implementation_id = serializers.UUIDField()
    dimension = serializers.ChoiceField(choices=Dimension.choices)
    status = serializers.CharField()
    levels_applied = serializers.IntegerField()


class ResidualRatingOut(RatingOut):
    method_version = serializers.CharField()
    explanation = TreatmentEffectOut(many=True)


class TreatmentOut(serializers.Serializer[Any]):
    implementation_id = serializers.UUIDField()
    dimension = serializers.ChoiceField(choices=Dimension.choices)
    levels = serializers.IntegerField()


class RiskHazardOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    category = serializers.ChoiceField(choices=HazardCategory.choices)
    name_de = serializers.CharField()
    name_en = serializers.CharField()


class RiskAssetOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    name = serializers.CharField()
    criticality = serializers.CharField()


class RiskOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    scope_id = serializers.UUIDField()
    scope_name = serializers.CharField()
    hazard_id = serializers.UUIDField()
    hazard = RiskHazardOut()
    asset_ids = serializers.ListField(child=serializers.UUIDField())
    assets = RiskAssetOut(many=True)
    title_de = serializers.CharField()
    owner_id = serializers.CharField(allow_null=True)
    owner_name = serializers.CharField(allow_null=True)
    inherent = RatingOut()
    target = RatingOut()
    residual = ResidualRatingOut(allow_null=True, help_text="Null while calculation is pending.")
    treatments = TreatmentOut(many=True)


class RiskMatrixCellOut(serializers.Serializer[Any]):
    likelihood = serializers.IntegerField()
    impact = serializers.IntegerField()
    count = serializers.IntegerField()
    worst_category = serializers.ChoiceField(choices=RiskCategory.choices)


class RiskMatrixOut(serializers.Serializer[Any]):
    cells = RiskMatrixCellOut(many=True)
    pending = serializers.IntegerField()
    total = serializers.IntegerField()


def _param(name: str, description: str) -> OpenApiParameter:
    return OpenApiParameter(name, str, required=False, description=description)


RATING_PARAM = _param("rating", "inherent, residual (default) or target.")
SCOPE_PARAM = _param("scope", "Only this Scope.")


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


class RisksView(TenantScopedAPIView):
    @extend_schema(
        operation_id="risks_list",
        summary="Risks with their three ratings, filtered by category or matrix cell",
        responses={200: page_schema("Risk", RiskOut())},
        parameters=[
            SCOPE_PARAM,
            _param("asset", "Only Risks affecting this Asset."),
            RATING_PARAM,
            _param("category", "A category of that rating; 'pending' for unrated Risks."),
            _param("likelihood", "A likelihood of that rating, 1 to 4."),
            _param("impact", "An impact of that rating, 1 to 4."),
            _param("ordering", "'-residual_score': worst first, unrated last."),
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        items = selectors.risks(self.actor, scope=query.get("scope"), asset=query.get("asset"))
        items = selectors.filtered(
            items,
            rating_kind=query.get("rating"),
            category=query.get("category"),
            likelihood=query.get("likelihood"),
            impact=query.get("impact"),
        )
        page = page_of(request, selectors.ordered(items, query.get("ordering")))
        page["items"] = [selectors.present_risk(r) for r in page["items"]]
        return Response(page)


class RiskView(TenantScopedAPIView):
    @extend_schema(operation_id="risks_retrieve", summary="One Risk", responses=RiskOut)
    def get(self, request: Request, tenant_slug: str, risk_id: UUID) -> Response:
        self.actor.require(Permission.VIEW)
        risk = selectors.risks(self.actor).filter(id=risk_id).first()
        if risk is None:
            raise NotFound
        return Response(selectors.present_risk(risk))


class RiskMatrixView(TenantScopedAPIView):
    @extend_schema(
        operation_id="risk_matrix_retrieve",
        summary="How many Risks sit in each cell of the matrix",
        responses=RiskMatrixOut,
        parameters=[SCOPE_PARAM, RATING_PARAM],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        items = selectors.risks(self.actor, scope=query.get("scope"))
        return Response(selectors.risk_matrix(items, query.get("rating")))
