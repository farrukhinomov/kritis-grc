import logging
import time
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from grc.core import request_context

access_log = logging.getLogger("grc.access")

API_PREFIX = "/api/"
# Responses that are the same for every visitor and may be cached by the edge. Matched
# exactly or as a directory, so look-alike paths can't slip into the cacheable set.
PUBLIC_API_PATHS = frozenset({"/api/v1/schema", "/api/ui"})
PUBLIC_API_DIRECTORIES = ("/api/ui/", "/api/static/")


class RequestContextMiddleware:
    """Assigns request and trace IDs and writes one access-log line per request."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = request_context.resolve_request_id(request.headers.get("X-Request-ID"))
        trace_id = request_context.resolve_trace_id(request.headers.get("traceparent"))
        tokens = request_context.bind(request_id, trace_id)
        # Also kept on the request for log lines Django writes after this middleware returns.
        request.request_id = request_id  # type: ignore[attr-defined]
        request.trace_id = trace_id  # type: ignore[attr-defined]
        started = time.perf_counter()
        try:
            response = self.get_response(request)
            response["X-Request-ID"] = request_id
            access_log.info(
                "request",
                extra={
                    "request_id": request_id,
                    "trace_id": trace_id,
                    "method": request.method,
                    # Path only: query strings can carry tokens or personal data.
                    "path": request.path,
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            return response
        finally:
            request_context.unbind(tokens)


class ApiCacheControlMiddleware:
    """Marks every API response as uncacheable unless it is explicitly public.

    The edge proxy in front of the API caches responses that look cacheable. Tenant data
    must never be served from a shared cache to another user, so the safe default wins.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if _is_private_api_path(request.path):
            response["Cache-Control"] = "private, no-store"
        return response


def _is_private_api_path(path: str) -> bool:
    if not path.startswith(API_PREFIX):
        return False
    is_public = path in PUBLIC_API_PATHS or (
        path.startswith(PUBLIC_API_DIRECTORIES) and ".." not in path
    )
    return not is_public
