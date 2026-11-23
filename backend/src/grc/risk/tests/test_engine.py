"""The risk-engine client: contract, batching, failures and the circuit breaker."""

import time

import httpx
import pytest

from grc.risk import engine
from grc.risk.testing import FakeRiskEngine


def _risk(number: int) -> dict[str, object]:
    return {"risk_id": f"r{number}", "inherent": {"likelihood": 3, "impact": 4}, "treatments": []}


def test_large_jobs_are_split_into_batches_the_engine_accepts(
    risk_engine: FakeRiskEngine,
) -> None:
    method, results = engine.score([_risk(n) for n in range(engine.MAX_BATCH + 1)])

    assert method == "qualitative-4x4/1"
    assert [len(r["risks"]) for r in risk_engine.requests] == [engine.MAX_BATCH, 1]
    assert results[0].category == "critical"


def test_an_error_answer_counts_as_unavailable(
    risk_engine: FakeRiskEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        engine, "_transport", lambda: httpx.MockTransport(lambda _: httpx.Response(503))
    )

    with pytest.raises(engine.RiskEngineUnavailableError, match="HTTPStatusError"):
        engine.score([_risk(1)])


def test_repeated_failures_pause_calls_until_the_breaker_closes(
    risk_engine: FakeRiskEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    risk_engine.down = True
    for _ in range(engine.FAILURES_TO_OPEN):
        with pytest.raises(engine.RiskEngineUnavailableError):
            engine.score([_risk(1)])

    risk_engine.down = False
    with pytest.raises(engine.RiskEngineUnavailableError, match="paused"):
        engine.score([_risk(1)])
    assert risk_engine.requests == []  # the open breaker didn't even try

    later = time.monotonic() + engine.OPEN_SECONDS + 1
    monkeypatch.setattr(time, "monotonic", lambda: later)
    assert engine.score([_risk(1)])[1]
