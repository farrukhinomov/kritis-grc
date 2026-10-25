import logging
import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from risk_engine import request_context
from risk_engine.problems import internal_error

access_log = logging.getLogger("risk_engine.access")
error_log = logging.getLogger("risk_engine.errors")


class RequestContextMiddleware:
    """Assigns request and trace IDs and writes one access-log line per request.

    Written as plain ASGI middleware rather than on top of BaseHTTPMiddleware, which
    runs the endpoint in a separate task and so loses context variables.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = request_context.resolve_request_id(headers.get("x-request-id"))
        trace_id = request_context.resolve_trace_id(headers.get("traceparent"))
        tokens = request_context.bind(request_id, trace_id)
        started = time.perf_counter()
        status = 500
        response_started = False

        async def send_with_request_id(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                MutableHeaders(scope=message).append("X-Request-ID", request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        except Exception:
            # Handled here rather than by the framework's outermost error handler, which
            # runs after this middleware has unbound the IDs: the failures that matter
            # most must be correlatable, in the log and in the response.
            error_log.exception(
                "Unhandled error", extra={"request_id": request_id, "trace_id": trace_id}
            )
            if response_started:
                raise
            await internal_error()(scope, receive, send_with_request_id)
        finally:
            access_log.info(
                "request",
                extra={
                    "request_id": request_id,
                    "trace_id": trace_id,
                    "method": scope["method"],
                    # Path only: query strings can carry tokens or personal data.
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_context.unbind(tokens)
