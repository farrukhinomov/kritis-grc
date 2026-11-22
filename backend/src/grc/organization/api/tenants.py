"""The Tenant itself and the people in it."""

from typing import Any

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of
from grc.organization import services
from grc.organization.models import Role, Theme
from grc.organization.selectors import (
    members_of,
    present_member,
    present_tenant,
    tenant_of,
)

TenantSchema = inline_serializer(
    "Tenant",
    {
        "slug": serializers.CharField(),
        "name": serializers.CharField(),
        "theme": serializers.ChoiceField(choices=Theme.choices),
        "sector": serializers.CharField(),
    },
)

MemberPageSchema = inline_serializer(
    "MemberPage",
    {
        "items": inline_serializer(
            "Member",
            {
                "id": serializers.CharField(),
                "display_name": serializers.CharField(),
                "email": serializers.EmailField(),
                "role": serializers.ChoiceField(choices=Role.choices),
                "job_title": serializers.CharField(),
            },
            many=True,
        ),
        "page": inline_serializer(
            "PageInfo",
            {
                "number": serializers.IntegerField(),
                "limit": serializers.IntegerField(),
                "total": serializers.IntegerField(),
            },
        ),
    },
)


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
