"""Managing one's own API Tokens. Only from a signed-in browser, never with a token."""

from typing import Any
from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from grc.core.api import TenantScopedAPIView, page_of, page_schema
from grc.core.problems import Problem
from grc.organization.models import ApiToken, TokenScope
from grc.organization.services import tokens


class ApiTokenOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    name = serializers.CharField()
    prefix = serializers.CharField()
    scope = serializers.ChoiceField(choices=TokenScope.choices)
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    revoked_at = serializers.DateTimeField(allow_null=True)


class NewApiTokenOut(ApiTokenOut):
    token = serializers.CharField(help_text="Shown once; only a hash is stored.")


class NewApiTokenIn(serializers.Serializer[Any]):
    name = serializers.CharField(max_length=100)
    scope = serializers.ChoiceField(choices=TokenScope.choices)
    expires_in_days = serializers.IntegerField(min_value=1, max_value=tokens.MAX_DAYS, default=90)


class _SessionOnly(TenantScopedAPIView):
    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        # A leaked token must not be able to mint itself successors.
        if isinstance(request.auth, ApiToken):
            raise Problem(
                status.HTTP_403_FORBIDDEN,
                "session_required",
                "API Tokens are managed from a signed-in session.",
            )


class ApiTokensView(_SessionOnly):
    @extend_schema(
        operation_id="api_tokens_list",
        summary="My API Tokens in this Tenant",
        responses={200: page_schema("ApiToken", ApiTokenOut())},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        page = page_of(request, tokens.tokens_of(self.actor))
        page["items"] = [tokens.present(t) for t in page["items"]]
        return Response(page)

    @extend_schema(
        operation_id="api_tokens_create",
        summary="Create an API Token; its value is shown only in this answer",
        request=NewApiTokenIn,
        responses={201: NewApiTokenOut},
    )
    def post(self, request: Request, tenant_slug: str) -> Response:
        data = NewApiTokenIn(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        row, secret = tokens.issue(
            self.actor, values["name"].strip(), values["scope"], values["expires_in_days"]
        )
        return Response({**tokens.present(row), "token": secret}, status=status.HTTP_201_CREATED)


class ApiTokenView(_SessionOnly):
    @extend_schema(operation_id="api_tokens_destroy", summary="Revoke", responses={204: None})
    def delete(self, request: Request, tenant_slug: str, token_id: UUID) -> Response:
        tokens.revoke(self.actor, token_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
