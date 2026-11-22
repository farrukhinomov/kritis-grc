"""Session endpoints: who am I, sign in with a password or a demo role, sign out."""

from typing import Any

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import permissions, serializers, status
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from grc.core.problems import Problem
from grc.organization import services
from grc.organization.models import Role, User
from grc.organization.selectors import session_of

SessionSchema = inline_serializer(
    "Session",
    {
        "user": inline_serializer(
            "SessionUser",
            {
                "id": serializers.CharField(),
                "display_name": serializers.CharField(),
                "email": serializers.EmailField(),
            },
        ),
        "memberships": inline_serializer(
            "SessionMembership",
            {
                "tenant": inline_serializer(
                    "SessionTenant",
                    {
                        "slug": serializers.CharField(),
                        "name": serializers.CharField(),
                        "theme": serializers.CharField(),
                    },
                ),
                "role": serializers.ChoiceField(choices=Role.choices),
            },
            many=True,
        ),
    },
)


class _CsrfProtectedView(APIView):
    """Session-changing endpoints check CSRF even for anonymous callers.

    DRF checks CSRF only once a user is signed in; without it here, another site could
    sign a visitor into an account of its choosing (login CSRF).
    """

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        try:
            SessionAuthentication().enforce_csrf(request)
        except PermissionDenied as error:
            raise Problem(status.HTTP_403_FORBIDDEN, "csrf_failed", "CSRF check failed.") from error
        super().initial(request, *args, **kwargs)


class LoginSerializer(serializers.Serializer[Any]):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False)


class DemoLoginSerializer(serializers.Serializer[Any]):
    role = serializers.ChoiceField(choices=Role.choices)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class MeView(APIView):
    """Also hands out the CSRF cookie, as the SPA asks for the session first."""

    @extend_schema(responses={200: SessionSchema}, summary="The signed-in user")
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, User)  # noqa: S101 - guaranteed by IsAuthenticated
        return Response(session_of(request.user))


class LoginView(_CsrfProtectedView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(request=LoginSerializer, responses={200: SessionSchema}, summary="Sign in")
    def post(self, request: Request) -> Response:
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session = services.password_login(
            request._request, data.validated_data["email"], data.validated_data["password"]
        )
        return Response(session)


class DemoLoginView(_CsrfProtectedView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(
        request=DemoLoginSerializer,
        responses={200: SessionSchema},
        summary="Sign in to the Demo Tenant as a demo role",
    )
    def post(self, request: Request) -> Response:
        data = DemoLoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        session = services.demo_login(request._request, Role(data.validated_data["role"]))
        return Response(session)


class LogoutView(_CsrfProtectedView):
    permission_classes = (permissions.AllowAny,)

    @extend_schema(request=None, responses={204: None}, summary="Sign out")
    def post(self, request: Request) -> Response:
        services.sign_out(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)
