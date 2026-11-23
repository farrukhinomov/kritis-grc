"""The Hazard catalogue, Risks and the risk matrix of a Tenant."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance.selectors import suggestions as suggestion_selectors
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.risk import selectors
from grc.risk.models import AssessmentStatus, Dimension, HazardCategory, RiskCategory
from grc.risk.selectors import assessments as assessment_selectors
from grc.risk.services import assessments


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


class RiskAssessmentOut(serializers.Serializer[Any]):
    id = serializers.UUIDField()
    scope_id = serializers.UUIDField()
    scope_name = serializers.CharField()
    title_de = serializers.CharField()
    assessed_on = serializers.DateField()
    status = serializers.ChoiceField(choices=AssessmentStatus.choices)
    risk_ids = serializers.ListField(child=serializers.UUIDField())
    summary_de = serializers.CharField()
    submitted_by_id = serializers.CharField()
    submitted_by_name = serializers.CharField()
    submitted_at = serializers.DateTimeField()
    decided_by_id = serializers.CharField(allow_null=True)
    decided_by_name = serializers.CharField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    decision_note_de = serializers.CharField(allow_null=True)
    next_due = serializers.DateField(
        allow_null=True, help_text="Four years after the assessment, once approved."
    )


class DecisionIn(serializers.Serializer[Any]):
    note_de = serializers.CharField(
        required=False, allow_blank=True, max_length=2000, help_text="Required to reject."
    )


class RiskAssessmentsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="risk_assessments_list",
        summary="Risk Assessments, newest first",
        responses={200: page_schema("RiskAssessment", RiskAssessmentOut())},
        parameters=[
            _param("status", "submitted, approved or rejected."),
            SCOPE_PARAM,
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        items = assessment_selectors.risk_assessments(
            self.actor, status_filter=query.get("status"), scope=query.get("scope")
        )
        page = page_of(request, items)
        page["items"] = [assessment_selectors.present_assessment(a) for a in page["items"]]
        return Response(page)


class _DecisionView(TenantScopedAPIView):
    decision: AssessmentStatus

    def post(self, request: Request, tenant_slug: str, assessment_id: UUID) -> Response:
        body = DecisionIn(data=request.data or {})
        body.is_valid(raise_exception=True)
        decided = assessments.decide(
            self.actor, assessment_id, self.decision, body.validated_data.get("note_de")
        )
        fresh = assessment_selectors.risk_assessments(self.actor).get(id=decided.id)
        return Response(assessment_selectors.present_assessment(fresh))


class ApproveRiskAssessmentView(_DecisionView):
    decision = AssessmentStatus.APPROVED

    @extend_schema(
        operation_id="risk_assessments_approve",
        summary="Approve a submitted Risk Assessment (not one's own)",
        request=DecisionIn,
        responses=RiskAssessmentOut,
    )
    def post(self, request: Request, tenant_slug: str, assessment_id: UUID) -> Response:
        return super().post(request, tenant_slug, assessment_id)


class RejectRiskAssessmentView(_DecisionView):
    decision = AssessmentStatus.REJECTED

    @extend_schema(
        operation_id="risk_assessments_reject",
        summary="Reject a submitted Risk Assessment, saying why",
        request=DecisionIn,
        responses=RiskAssessmentOut,
    )
    def post(self, request: Request, tenant_slug: str, assessment_id: UUID) -> Response:
        return super().post(request, tenant_slug, assessment_id)


class ApprovalItemOut(serializers.Serializer[Any]):
    kind = serializers.ChoiceField(choices=["mapping_suggestion", "risk_assessment"])
    id = serializers.CharField()
    title = serializers.CharField()
    detail = serializers.CharField()
    scope_id = serializers.UUIDField(allow_null=True)
    submitted_by_name = serializers.CharField(allow_null=True)
    submitted_at = serializers.DateTimeField()


class ApprovalsOut(serializers.Serializer[Any]):
    items = ApprovalItemOut(many=True)
    total = serializers.IntegerField()


class ApprovalsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="approvals_list",
        summary="Everything waiting for the caller's approval, oldest first",
        description=(
            "Pending Mapping Suggestions (for Memberships covering the whole Tenant) and "
            "submitted Risk Assessments the caller didn't submit. Callers who can't approve "
            "get an empty list."
        ),
        responses=ApprovalsOut,
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        # The oldest first, whichever module it comes from: what waited longest is next.
        items = sorted(
            suggestion_selectors.awaiting_decision_by(self.actor)
            + assessment_selectors.awaiting_decision_by(self.actor),
            key=lambda item: (item["submitted_at"], item["id"]),
        )
        return Response({"items": items, "total": len(items)})
