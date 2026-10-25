"""Liveness and readiness probes for the container platform.

Probes are answered by middleware, before Django's host validation, HTTPS redirect and
per-request transaction. Platform probes reach the container by IP over plain HTTP, and
a database outage must produce a clean 503 rather than an unhandled error.
"""

import logging
from collections.abc import Callable

from django.db import DatabaseError, connection
from django.http import HttpRequest, HttpResponse, JsonResponse

logger = logging.getLogger(__name__)

LIVE_PATH = "/health/live"
READY_PATH = "/health/ready"


def live() -> JsonResponse:
    # Deliberately touches nothing else, so a database outage doesn't make the platform
    # restart healthy instances in a loop.
    return JsonResponse({"status": "ok"})


def ready() -> JsonResponse:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        # Details go to the log only; the probe response is public.
        logger.exception("Readiness check failed: database unavailable")
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})


class HealthCheckMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.method == "GET":
            if request.path == LIVE_PATH:
                return live()
            if request.path == READY_PATH:
                return ready()
        return self.get_response(request)
