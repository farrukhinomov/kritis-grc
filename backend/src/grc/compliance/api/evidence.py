"""Evidence of an Implementation, and the upload slots its files go through."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response

from grc.compliance.api.schemas import EvidenceOut, UploadSlotOut
from grc.compliance.models import EvidenceKind
from grc.compliance.selectors.implementations import evidence_of, present_evidence
from grc.compliance.services.evidence import add_evidence, delete_evidence, request_upload
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.core.problems import FieldProblem
from grc.organization.services.idempotency import once


class UploadRequestIn(serializers.Serializer[Any]):
    name = serializers.CharField(max_length=255)
    size_bytes = serializers.IntegerField()
    content_type = serializers.CharField(max_length=128)


class NewEvidenceIn(serializers.Serializer[Any]):
    kind = serializers.ChoiceField(choices=EvidenceKind.choices)
    title = serializers.CharField(max_length=200)
    url = serializers.URLField(max_length=2000, required=False)
    referenced_implementation_id = serializers.UUIDField(required=False)
    upload_id = serializers.UUIDField(required=False)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["kind"] == EvidenceKind.LINK and not attrs.get("url"):
            raise serializers.ValidationError({"url": "Required."}, code="invalid_url")
        return attrs


class UploadsView(TenantScopedAPIView):
    @extend_schema(
        operation_id="uploads_create",
        summary="A presigned URL to PUT one file to storage",
        request=UploadRequestIn,
        responses={201: UploadSlotOut},
    )
    def post(self, request: Request, tenant_slug: str) -> Response:
        data = UploadRequestIn(data=request.data)
        if not data.is_valid():
            # The UI reports any problem with the announced file on the file itself.
            raise FieldProblem([{"field": "file", "code": "required"}])
        values = data.validated_data
        slot = request_upload(
            self.actor, values["name"].strip(), values["size_bytes"], values["content_type"]
        )
        return Response(slot, status=status.HTTP_201_CREATED)


class EvidenceListView(TenantScopedAPIView):
    @extend_schema(
        operation_id="evidence_list",
        summary="Evidence of an Implementation",
        responses={200: page_schema("Evidence", EvidenceOut())},
    )
    def get(self, request: Request, tenant_slug: str, implementation_id: UUID) -> Response:
        self.actor.require(Permission.VIEW)
        items = evidence_of(self.actor, implementation_id)
        if items is None:
            raise NotFound
        page = page_of(request, items)
        page["items"] = [present_evidence(e) for e in page["items"]]
        return Response(page)

    @extend_schema(
        operation_id="evidence_create",
        summary="Attach a file, a link or a reference",
        request=NewEvidenceIn,
        parameters=[OpenApiParameter("Idempotency-Key", str, OpenApiParameter.HEADER)],
        responses={201: EvidenceOut},
    )
    def post(self, request: Request, tenant_slug: str, implementation_id: UUID) -> Response:
        data = NewEvidenceIn(data=request.data)
        data.is_valid(raise_exception=True)

        def create() -> tuple[int, Any]:
            evidence = add_evidence(self.actor, implementation_id, dict(data.validated_data))
            return status.HTTP_201_CREATED, present_evidence(evidence)

        code, body, replayed = once(
            self.actor,
            request.headers.get("Idempotency-Key"),
            {"path": request.path, "body": request.data},
            create,
        )
        headers = {"Idempotent-Replayed": "true"} if replayed else None
        return Response(body, status=code, headers=headers)


class EvidenceView(TenantScopedAPIView):
    @extend_schema(
        operation_id="evidence_destroy", summary="Remove Evidence", responses={204: None}
    )
    def delete(
        self, request: Request, tenant_slug: str, implementation_id: UUID, evidence_id: UUID
    ) -> Response:
        delete_evidence(self.actor, implementation_id, evidence_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
