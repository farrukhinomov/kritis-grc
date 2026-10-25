"""Per-request correlation IDs, available to any code running inside a request.

The request ID ties together every log line of one request. The trace ID follows the
W3C Trace Context standard, so a request can be followed from the edge proxy through the
API into this service without a tracing vendor. The rules match the API service exactly,
so both services accept and reject the same incoming headers.
"""

import re
import secrets
import uuid
from contextvars import ContextVar, Token

# Incoming IDs are echoed into headers and logs, so only a safe, bounded shape is accepted.
_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
_TRACEPARENT = re.compile(r"00-(?P<trace_id>[0-9a-f]{32})-(?P<parent_id>[0-9a-f]{16})-[0-9a-f]{2}")
_INVALID_TRACE_ID = "0" * 32
_INVALID_PARENT_ID = "0" * 16
_UNSET = "-"

_request_id: ContextVar[str] = ContextVar("request_id", default=_UNSET)
_trace_id: ContextVar[str] = ContextVar("trace_id", default=_UNSET)

type Bound = tuple[Token[str], Token[str]]


def resolve_request_id(incoming: str | None) -> str:
    if incoming and _REQUEST_ID.fullmatch(incoming):
        return incoming
    return uuid.uuid4().hex


def resolve_trace_id(traceparent: str | None) -> str:
    """Continue the caller's trace if its header is valid, otherwise start a new one."""
    match = _TRACEPARENT.fullmatch(traceparent or "")
    if (
        match
        and match["trace_id"] != _INVALID_TRACE_ID
        and match["parent_id"] != _INVALID_PARENT_ID
    ):
        return match["trace_id"]
    return secrets.token_hex(16)


def current_request_id() -> str:
    return _request_id.get()


def current_trace_id() -> str:
    return _trace_id.get()


def bind(request_id: str, trace_id: str) -> Bound:
    return _request_id.set(request_id), _trace_id.set(trace_id)


def unbind(tokens: Bound) -> None:
    request_token, trace_token = tokens
    _request_id.reset(request_token)
    _trace_id.reset(trace_token)
