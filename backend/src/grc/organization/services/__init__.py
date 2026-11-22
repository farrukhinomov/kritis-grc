"""Signing in and out.

Passwords are verified by allauth, which also rate-limits failed attempts by address and
by IP; this module only decides who may get a session. The demo login is a separate
door: it exists only while switched on, only for the Demo Tenant's shared accounts, and
has its own rate limit because it needs no secret.
"""

from allauth.account.adapter import get_adapter
from allauth.core import ratelimit
from django.conf import settings
from django.contrib.auth import login, logout
from django.core.exceptions import ValidationError
from django.http import HttpRequest
from rest_framework import status

from grc.core.problems import Problem
from grc.organization.models import Role, User
from grc.organization.selectors import Session, demo_account, session_of

AUTH_BACKEND = "allauth.account.auth_backends.AuthenticationBackend"


def password_login(request: HttpRequest, email: str, password: str) -> Session:
    try:
        user = get_adapter(request).authenticate(request, email=email, password=password)
    except ValidationError as error:
        raise _too_many_attempts() from error
    # Demo accounts have no usable password, so this also keeps them out of this door.
    if not isinstance(user, User) or user.is_demo_account:
        # Same answer whether the address exists or not, so accounts can't be probed.
        raise Problem(
            status.HTTP_400_BAD_REQUEST,
            "invalid_credentials",
            "Email or password is not correct.",
        )
    login(request, user, backend=AUTH_BACKEND)
    return session_of(user)


def demo_login(request: HttpRequest, role: Role) -> Session:
    if not settings.DEMO_LOGIN_ENABLED:
        # Answers as if the endpoint did not exist, like every switched-off feature.
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if not ratelimit.consume(request, action="demo_login"):
        raise _too_many_attempts()
    user = demo_account(role)
    if user is None:
        raise Problem(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "service_unavailable",
            "The demo is not set up.",
        )
    login(request, user, backend=AUTH_BACKEND)
    return session_of(user)


def sign_out(request: HttpRequest) -> None:
    logout(request)


def _too_many_attempts() -> Problem:
    return Problem(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "too_many_requests",
        "Too many attempts. Try again later.",
    )
