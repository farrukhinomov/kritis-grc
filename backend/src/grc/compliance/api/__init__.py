"""The legal catalogue and the Mappings, as a Tenant sees them."""

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance import selectors
from grc.compliance.api.schemas import FrameworkOut, MappingOut, RequirementOut
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema


def _param(name: str, description: str) -> OpenApiParameter:
    return OpenApiParameter(name, str, required=False, description=description)


class FrameworksView(TenantScopedAPIView):
    @extend_schema(
        operation_id="frameworks_list",
        summary="Frameworks with their versions",
        responses={200: page_schema("Framework", FrameworkOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        page = page_of(request, selectors.frameworks())
        page["items"] = [selectors.present_framework(f) for f in page["items"]]
        return Response(page)


class RequirementsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="requirements_list",
        summary="Requirements in statute order",
        responses={200: page_schema("Requirement", RequirementOut())},
        parameters=[
            _param("framework_version", "Only this Framework Version."),
            _param("paragraph", "Only this paragraph, e.g. '§ 13'."),
            _param("search", "Part of the citation or title."),
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        items = selectors.requirements(
            framework_version=query.get("framework_version"),
            paragraph=query.get("paragraph"),
            search=(query.get("search") or "").strip() or None,
        )
        page = page_of(request, items)
        page["items"] = [selectors.present_requirement(r) for r in page["items"]]
        return Response(page)


class RequirementView(TenantScopedAPIView):
    @extend_schema(
        operation_id="requirements_retrieve", summary="One Requirement", responses=RequirementOut
    )
    def get(self, request: Request, tenant_slug: str, requirement_id: str) -> Response:
        self.actor.require(Permission.VIEW)
        requirement = selectors.requirements().filter(id=requirement_id).first()
        if requirement is None:
            raise NotFound
        return Response(selectors.present_requirement(requirement))


class MappingsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="mappings_list",
        summary="Platform Mappings and the Tenant's approved Mappings",
        responses={200: page_schema("Mapping", MappingOut())},
        parameters=[
            _param("target_requirement", "Only Mappings to this Requirement."),
            _param("source_requirement", "Only Mappings from this Requirement."),
        ],
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        items = selectors.mappings(
            self.actor,
            target=request.query_params.get("target_requirement"),
            source=request.query_params.get("source_requirement"),
        )
        return Response(page_of(request, items))
