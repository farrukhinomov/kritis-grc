"""The legal deadlines of every Critical Facility a member may see."""

from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView
from grc.organization.models import RegistrationStatus, ScopeKind
from grc.organization.selectors import scopes
from grc.organization.selectors.legal import Facility, tenant_deadlines
from grc.risk.selectors.assessments import latest_approved

OBLIGATIONS = [
    "risk_analysis",
    "resilience_measures",
    "incident_reporting",
    "management_duties",
    "risk_assessment_renewal",
]
BASES = ["planned_registration", "confirmed_registration", "approved_risk_assessment"]


class DeadlineItemOut(serializers.Serializer[Any]):
    scope_id = serializers.UUIDField()
    scope_name = serializers.CharField()
    citation = serializers.CharField()
    obligation = serializers.ChoiceField(choices=OBLIGATIONS)
    due_date = serializers.DateField()
    binding = serializers.BooleanField(help_text="False while the Registration is only planned.")
    basis = serializers.ChoiceField(choices=BASES)


class DeadlinesOut(serializers.Serializer[Any]):
    items = DeadlineItemOut(many=True)


class DeadlinesView(TenantScopedAPIView):
    @extend_schema(
        operation_id="deadlines_list",
        summary="Every legal deadline of the Critical Facilities, soonest first",
        description="One aggregate, never paged, so a dashboard can't miss the next deadline.",
        responses=DeadlinesOut,
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        assessed = latest_approved(self.actor)
        facilities = [
            Facility(
                scope_id=str(scope.id),
                name=scope.name,
                sector=scope.sector,
                registration_date=scope.registration_date,
                confirmed=scope.registration_status == RegistrationStatus.CONFIRMED,
                assessed_on=assessed.get(scope.id),
            )
            for scope in scopes(self.actor, kind=ScopeKind.CRITICAL_FACILITY)
            if scope.registration_date is not None
        ]
        return Response({"items": tenant_deadlines(facilities)})
