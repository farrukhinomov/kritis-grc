"""Authentication of programs by API Token (`Authorization: Bearer grc_…`).

CSRF does not apply: a browser never sends this header on its own, so another site
can't make it send one. DRF loads this class while it is still importing itself, so the
token lookup, which needs the rest of the app, is imported on first use.
"""

from typing import Any

from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request


class ApiTokenAuthentication(BaseAuthentication):
    def authenticate(self, request: Request) -> tuple[Any, Any] | None:
        header = get_authorization_header(request).decode("latin-1")
        scheme, _, value = header.partition(" ")
        if scheme.lower() != "bearer":
            return None
        from grc.organization.services.tokens import find

        token = find(value.strip())
        if token is None:
            raise AuthenticationFailed
        return token.membership.user, token

    def authenticate_header(self, request: Request) -> str:
        return 'Bearer realm="api"'
