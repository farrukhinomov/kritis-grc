"""Client for the risk engine, the stateless service that calculates Residual Ratings.

Django sends everything a calculation needs and stores the answer; the engine never
reads the database. The call is a pure function of its input, so it is safe to retry.
Failures surface as `RiskEngineUnavailableError`: the caller leaves the rating pending
and the outbox retries later. A circuit breaker stops a request from waiting on an
engine that has just failed several times in a row.
"""

import threading
import time
from dataclasses import dataclass
from typing import Any

import httpx
from django.conf import settings

from grc.core import request_context

BATCH_PATH = "/v1/risk-scores:batch"
# The engine refuses larger batches; bigger jobs are split.
MAX_BATCH = 500
# Short enough that the request which triggered a recalculation never waits long.
TIMEOUT = httpx.Timeout(10.0, connect=2.0)
# Connection failures are retried with backoff by the transport; any other failure is
# left to the outbox, which retries with its own, much longer backoff.
CONNECT_RETRIES = 2
FAILURES_TO_OPEN = 5
OPEN_SECONDS = 30.0


class RiskEngineUnavailableError(RuntimeError):
    """No Residual Rating could be calculated now; it stays pending and is retried."""


@dataclass(frozen=True, slots=True)
class Scored:
    risk_id: str
    likelihood: int
    impact: int
    score: int
    category: str
    explanation: list[dict[str, Any]]


class _Breaker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures = 0
        self._open_until = 0.0

    def check(self) -> None:
        with self._lock:
            if time.monotonic() < self._open_until:
                raise RiskEngineUnavailableError("The risk engine failed repeatedly; paused.")

    def succeeded(self) -> None:
        with self._lock:
            self._failures = 0
            self._open_until = 0.0

    def failed(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= FAILURES_TO_OPEN:
                self._open_until = time.monotonic() + OPEN_SECONDS


_breaker = _Breaker()


def score(risks: list[dict[str, Any]]) -> tuple[str, list[Scored]]:
    """Residual Ratings for `risks` (the engine's `RiskIn` shape) and the method version."""
    base_url = settings.RISK_ENGINE_URL
    if not base_url:
        raise RiskEngineUnavailableError("No risk engine is configured.")
    _breaker.check()
    method_version = ""
    results: list[Scored] = []
    with httpx.Client(
        base_url=base_url,
        timeout=TIMEOUT,
        transport=_transport(),
        headers=request_context.outgoing_headers(),
    ) as client:
        for start in range(0, len(risks), MAX_BATCH):
            method_version, batch = _post(client, risks[start : start + MAX_BATCH])
            results.extend(batch)
    return method_version, results


def _transport() -> httpx.BaseTransport:
    return httpx.HTTPTransport(retries=CONNECT_RETRIES)


def reset_breaker() -> None:
    """For tests: forget earlier failures."""
    _breaker.succeeded()


def _post(client: httpx.Client, risks: list[dict[str, Any]]) -> tuple[str, list[Scored]]:
    try:
        response = client.post(BATCH_PATH, json={"risks": risks})
        response.raise_for_status()
        body = response.json()
    except (httpx.HTTPError, ValueError) as error:
        _breaker.failed()
        raise RiskEngineUnavailableError(type(error).__name__) from error
    _breaker.succeeded()
    return body["method_version"], [
        Scored(
            risk_id=item["risk_id"],
            likelihood=item["residual"]["likelihood"],
            impact=item["residual"]["impact"],
            score=item["score"],
            category=item["category"],
            explanation=[
                {
                    "implementation_id": e["implementation_id"],
                    "dimension": e["dimension"],
                    "status": e["implementation_status"],
                    "levels_applied": e["levels_applied"],
                }
                for e in item["explanations"]
            ],
        )
        for item in body["results"]
    ]
