"""Client for Mapping Suggestions from the AI service, the only module that calls it.

What it sends is limited to Requirements of the public catalogue (id, citation, statute
text), which the service's contract enforces too: no field could carry tenant data.
Failures surface as two errors: "unavailable" (try again later) and "declined" (this
target got no usable answer; move on).
"""

from dataclasses import dataclass
from typing import Any

import httpx
from django.conf import settings

from grc.core import request_context

GENERATE_PATH = "/v1/mapping-suggestions:generate"
# A model answer takes seconds, not milliseconds; connecting must still be quick.
TIMEOUT = httpx.Timeout(150.0, connect=2.0)
CONNECT_RETRIES = 2


class SuggesterUnavailableError(RuntimeError):
    """No answer now (not configured, overloaded, unreachable); retry later."""


class SuggesterDeclinedError(RuntimeError):
    """The model gave no usable answer for this target."""


@dataclass(frozen=True, slots=True)
class Generated:
    model: str
    prompt_version: str
    suggestions: list[dict[str, Any]]


def generate(target: dict[str, str], candidates: list[dict[str, str]]) -> Generated:
    base_url = settings.RISK_ENGINE_URL
    if not base_url:
        raise SuggesterUnavailableError("No AI service is configured.")
    try:
        with httpx.Client(
            base_url=base_url,
            timeout=TIMEOUT,
            transport=_transport(),
            headers=request_context.outgoing_headers(),
        ) as client:
            response = client.post(GENERATE_PATH, json={"target": target, "candidates": candidates})
    except httpx.HTTPError as error:
        raise SuggesterUnavailableError(type(error).__name__) from error
    if response.status_code == httpx.codes.BAD_GATEWAY:
        raise SuggesterDeclinedError("model_declined")
    if response.is_error:
        raise SuggesterUnavailableError(f"HTTP {response.status_code}")
    body = response.json()
    return Generated(body["model"], body["prompt_version"], body["suggestions"])


def _transport() -> httpx.BaseTransport:
    return httpx.HTTPTransport(retries=CONNECT_RETRIES)
