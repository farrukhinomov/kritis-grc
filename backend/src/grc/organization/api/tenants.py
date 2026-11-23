"""The Tenant itself and the people in it."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.actor import Permission
from grc.core.api import DateIn, TenantScopedAPIView, page_of, page_schema
from grc.core.problems import Problem
from grc.organization import services
from grc.organization.models import RegistrationStatus, Role, ScopeKind, Theme
from grc.organization.selectors import (
    members_of,
    present_member,
    present_scope,
    present_tenant,
    scopes,
    tenant_of,
)
from grc.organization.selectors.legal import CRITICAL_SERVICES, check_applicability, service_for
from grc.organization.services.idempotency import once

TenantSchema = inline_serializer(
    "Tenant",
    {
        "slug": serializers.CharField(),
        "name": serializers.CharField(),
        "theme": serializers.ChoiceField(choices=Theme.choices),
        "sector": serializers.CharField(),
    },
)


class MemberOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    display_name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=Role.choices)
    job_title = serializers.CharField()


MemberPageSchema = page_schema("Member", MemberOut())


class ThemeChangeSerializer(serializers.Serializer[Any]):
    theme = serializers.ChoiceField(choices=Theme.choices)


class TenantView(TenantScopedAPIView):
    @extend_schema(responses={200: TenantSchema}, summary="The Tenant")
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        return Response(present_tenant(tenant_of(self.actor)))

    @extend_schema(
        request=ThemeChangeSerializer,
        responses={200: TenantSchema},
        summary="Change the Tenant's Theme",
    )
    def patch(self, request: Request, tenant_slug: str) -> Response:
        data = ThemeChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        tenant = services.change_theme(self.actor, Theme(data.validated_data["theme"]))
        return Response(present_tenant(tenant))


class MembersView(TenantScopedAPIView):
    @extend_schema(responses={200: MemberPageSchema}, summary="People with a Membership")
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        page = page_of(request, members_of(self.actor))
        page["items"] = [present_member(m) for m in page["items"]]
        return Response(page)


class RegistrationOut(serializers.Serializer[Any]):
    status = serializers.ChoiceField(choices=RegistrationStatus.choices)
    date = serializers.DateField()


class DeadlineOut(serializers.Serializer[Any]):
    citation = serializers.CharField()
    due_date = serializers.DateField()
    binding = serializers.BooleanField()


class CriticalFacilityOut(serializers.Serializer[Any]):
    sector = serializers.CharField()
    critical_service = serializers.CharField()
    people_supplied = serializers.IntegerField()
    threshold = serializers.IntegerField()
    location = serializers.CharField()
    registration = RegistrationOut()
    deadlines = DeadlineOut(many=True)


class ScopeOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=ScopeKind.choices)
    critical_facility = CriticalFacilityOut(allow_null=True)


class CriticalServiceOut(serializers.Serializer[Any]):
    sector = serializers.CharField()
    critical_service = serializers.CharField()
    measure = serializers.CharField()
    threshold = serializers.IntegerField()
    threshold_basis = serializers.CharField()
    citation = serializers.CharField()


class NewRegistrationIn(serializers.Serializer[Any]):
    # Only planned: confirming a Registration is the authority's act, not the user's.
    status = serializers.ChoiceField(choices=[RegistrationStatus.PLANNED])
    date = DateIn()


class NewFacilityDetailsIn(serializers.Serializer[Any]):
    sector = serializers.CharField(max_length=32)
    critical_service = serializers.CharField(max_length=64)
    people_supplied = serializers.IntegerField()
    registration = NewRegistrationIn()

    def validate_people_supplied(self, value: int) -> int:
        if value <= 0:
            raise serializers.ValidationError("Must be positive.", code="invalid")
        return value


class NewCriticalFacilityIn(serializers.Serializer[Any]):
    name = serializers.CharField(max_length=200)
    location = serializers.CharField(max_length=200)
    critical_facility = NewFacilityDetailsIn()


class ScopesView(TenantScopedAPIView):
    @extend_schema(
        operation_id="scopes_list",
        summary="Scopes, Critical Facilities with their projected or binding deadlines",
        parameters=[OpenApiParameter("kind", str, required=False, enum=ScopeKind.values)],
        responses={200: page_schema("Scope", ScopeOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        kind = request.query_params.get("kind")
        if kind is not None and kind not in ScopeKind.values:
            raise Problem(status.HTTP_400_BAD_REQUEST, "invalid_filter", "Unknown kind.")
        page = page_of(request, scopes(self.actor, kind=kind))
        page["items"] = [present_scope(s) for s in page["items"]]
        return Response(page)

    @extend_schema(
        operation_id="scopes_create",
        summary="Add a Critical Facility found by the Applicability Check",
        request=NewCriticalFacilityIn,
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)],
        responses={201: ScopeOut},
    )
    def post(self, request: Request, tenant_slug: str) -> Response:
        data = NewCriticalFacilityIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        details = values["critical_facility"]

        def create() -> tuple[int, Any]:
            scope = services.create_critical_facility(
                self.actor,
                name=values["name"].strip(),
                location=values["location"].strip(),
                sector=details["sector"],
                critical_service=details["critical_service"],
                people_supplied=details["people_supplied"],
                registration_date=details["registration"]["date"],
            )
            return status.HTTP_201_CREATED, present_scope(scope)

        code, body, replayed = once(
            self.actor,
            request.headers.get("Idempotency-Key"),
            {"path": request.path, "body": request.data},
            create,
        )
        headers = {"Idempotent-Replayed": "true"} if replayed else None
        return Response(body, status=code, headers=headers)


class ScopeView(TenantScopedAPIView):
    @extend_schema(operation_id="scopes_retrieve", summary="One Scope", responses=ScopeOut)
    def get(self, request: Request, tenant_slug: str, scope_id: UUID) -> Response:
        self.actor.require(Permission.VIEW)
        scope = scopes(self.actor).filter(id=scope_id).first()
        if scope is None:
            raise NotFound
        return Response(present_scope(scope))


class CriticalServicesView(TenantScopedAPIView):
    @extend_schema(
        operation_id="critical_services_list",
        summary="Critical Services the law names, with their thresholds",
        responses={200: page_schema("CriticalService", CriticalServiceOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        return Response(page_of(request, [s.present() for s in CRITICAL_SERVICES]))


class ApplicabilityCitationsOut(serializers.Serializer[Any]):
    definition = serializers.CharField()
    threshold = serializers.CharField()
    registration = serializers.CharField()


class ApplicabilityOut(serializers.Serializer[Any]):
    sector = serializers.CharField()
    critical_service = serializers.CharField()
    people_supplied = serializers.IntegerField()
    applies = serializers.BooleanField()
    threshold = serializers.IntegerField()
    threshold_basis = serializers.ChoiceField(choices=["statutory_default", "ordinance"])
    binding = serializers.BooleanField(help_text="False while the thresholds ordinance is pending.")
    not_binding_reason = serializers.ChoiceField(choices=["ordinance_pending"], allow_null=True)
    registration_within_months = serializers.IntegerField()
    citations = ApplicabilityCitationsOut()


class ApplicabilityCheckView(TenantScopedAPIView):
    @extend_schema(
        operation_id="applicability_check_retrieve",
        summary="Whether the KRITIS-Dachgesetz applies to a facility, and on what basis",
        responses=ApplicabilityOut,
        parameters=[
            OpenApiParameter("sector", str, required=True, description="e.g. water"),
            OpenApiParameter(
                "critical_service", str, required=True, description="e.g. drinking_water_supply"
            ),
            OpenApiParameter(
                "people_supplied", int, required=True, description="A whole number, 0 or more."
            ),
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        definition = service_for(query.get("sector", ""), query.get("critical_service", ""))
        people = query.get("people_supplied", "")
        if definition is None or not people.isdigit():
            raise Problem(
                status.HTTP_400_BAD_REQUEST,
                "invalid_filter",
                "Name a known Critical Service and a whole number.",
            )
        return Response(check_applicability(definition, int(people)))
