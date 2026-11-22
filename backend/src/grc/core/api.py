"""The base for every endpoint under /api/v1/tenants/{tenant_slug}/.

The Tenant comes from the URL, never from the session, and the caller's Membership in it
is resolved on every request. Without one the answer is 404, so the existence of other
Tenants is never revealed. The Tenant is activated here, at the start of the view,
because the request transaction wraps the view but not the middleware: a setting made in
middleware would land outside the transaction and vanish before the view runs.
"""

from contextlib import ExitStack
from typing import Any

from django.conf import settings
from django.utils.module_loading import import_string
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from grc.core.actor import Actor
from grc.core.problems import Problem
from grc.core.tenancy import tenant_context, user_context

DEFAULT_LIMIT = 25
MAX_LIMIT = 100


class TenantScopedAPIView(APIView):
    actor: Actor

    def initial(self, request: Request, *args: Any, **kwargs: Any) -> None:
        super().initial(request, *args, **kwargs)
        # The resolver lives with the Memberships; naming it in settings keeps this shared
        # code free of imports from any business module.
        resolve = import_string(settings.GRC_ACTOR_RESOLVER)
        actor: Actor | None = resolve(request.user, kwargs["tenant_slug"])
        if actor is None:
            raise NotFound
        self.actor = actor
        self._contexts = ExitStack()
        self._contexts.enter_context(tenant_context(actor.tenant_id))
        self._contexts.enter_context(user_context(actor.user_id))

    def finalize_response(
        self, request: Request, response: Response, *args: Any, **kwargs: Any
    ) -> Response:
        contexts: ExitStack | None = getattr(self, "_contexts", None)
        if contexts is not None:
            contexts.close()
        return super().finalize_response(request, response, *args, **kwargs)


def page_of(request: Request, items: Any) -> dict[str, Any]:
    """`{items, page: {number, limit, total}}`, the one list shape of the API."""
    number = _positive(request.query_params.get("page"), 1)
    limit = _positive(request.query_params.get("limit"), DEFAULT_LIMIT)
    limit = min(limit, MAX_LIMIT)
    start = (number - 1) * limit
    return {
        "items": list(items[start : start + limit]),
        "page": {"number": number, "limit": limit, "total": items.count()},
    }


def _positive(value: str | None, fallback: int) -> int:
    if value is None:
        return fallback
    if not value.isdigit() or int(value) < 1:
        raise Problem(
            status.HTTP_400_BAD_REQUEST,
            "invalid_pagination",
            "page and limit must be positive integers.",
        )
    return int(value)
