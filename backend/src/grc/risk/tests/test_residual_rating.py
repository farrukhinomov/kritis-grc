"""Residual Ratings follow the Implementations behind their Treatments.

The risk engine is replaced by a stand-in held to the engine's published contract.
"""

from collections.abc import Callable
from datetime import timedelta
from io import StringIO
from typing import Any

import httpx
import pytest
from django.core.management import call_command
from django.test import Client
from django.utils import timezone
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.core.outbox.models import DeliveryStatus, OutboxDelivery
from grc.core.outbox.services import drain
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_ids
from grc.risk import engine
from grc.risk.models import Risk
from grc.risk.services.rating import recalculate
from grc.risk.testing import FakeRiskEngine

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"
TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736"
TRACEPARENT = f"00-{TRACE_ID}-00f067aa0ba902b7-01"
POWER = "rk-n-power"  # treated by im-015 (impact, 2 levels) and im-009 (likelihood, 1)


def _uuid(fixture_id: str) -> Any:
    return fixture_uuid("muster-stadtwerke", fixture_id)


@pytest.fixture
def seed(
    settings: Settings, django_capture_on_commit_callbacks: Callable[..., Any]
) -> Callable[[], None]:
    settings.DEMO_LOGIN_ENABLED = True

    def run() -> None:
        with django_capture_on_commit_callbacks(execute=True):
            call_command("seed_demo", stdout=StringIO())

    return run


def _manager() -> Client:
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "grc_manager"}, content_type="application/json")
    return client


def _risk(client: Client, fixture_id: str) -> dict[str, Any]:
    body: dict[str, Any] = client.get(f"{TENANT}/risks/{_uuid(fixture_id)}").json()
    return body


def _deliveries() -> list[OutboxDelivery]:
    with tenant_context(tenant_ids()[0]):
        return list(OutboxDelivery.objects.all())


def test_loading_the_demo_rates_every_risk(
    seed: Callable[[], None], risk_engine: FakeRiskEngine
) -> None:
    seed()

    risks = _manager().get(f"{TENANT}/risks?limit=100").json()["items"]
    assert risks
    assert all(r["residual"] and r["residual"]["method_version"] for r in risks)
    assert len(risk_engine.requests) == len(risks)


def test_setting_a_treatment_implemented_moves_its_risk(
    seed: Callable[[], None],
    risk_engine: FakeRiskEngine,
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    seed()
    client = _manager()
    before = _risk(client, POWER)["residual"]
    implementation = client.get(f"{TENANT}/implementations/{_uuid('im-015')}")
    assert implementation.json()["status"] != "implemented"

    with django_capture_on_commit_callbacks(execute=True):
        response = client.patch(
            f"{TENANT}/implementations/{_uuid('im-015')}",
            {"status": "implemented"},
            content_type="application/json",
            headers={"If-Match": implementation["ETag"]},
        )
    assert response.status_code == 200, response.content

    after = _risk(client, POWER)["residual"]
    assert after["impact"] < before["impact"]
    assert {"implementation_id": str(_uuid("im-015")), "status": "implemented"}.items() <= next(
        e for e in after["explanation"] if e["implementation_id"] == str(_uuid("im-015"))
    ).items()
    matrix = client.get(f"{TENANT}/risk-matrix").json()
    assert matrix["pending"] == 0


def test_the_engine_joins_the_callers_trace(
    seed: Callable[[], None],
    risk_engine: FakeRiskEngine,
    django_capture_on_commit_callbacks: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed()
    seen: list[dict[str, str]] = []
    contract = risk_engine.transport()

    def recording() -> httpx.MockTransport:
        def handle(request: httpx.Request) -> httpx.Response:
            seen.append(dict(request.headers))
            return contract.handle_request(request)

        return httpx.MockTransport(handle)

    monkeypatch.setattr(engine, "_transport", recording)
    client = _manager()
    implementation = client.get(f"{TENANT}/implementations/{_uuid('im-015')}")

    with django_capture_on_commit_callbacks(execute=True):
        client.patch(
            f"{TENANT}/implementations/{_uuid('im-015')}",
            {"status": "implemented"},
            content_type="application/json",
            headers={"If-Match": implementation["ETag"], "traceparent": TRACEPARENT},
        )

    # The trace is stored with the event, so even a later retry stays in the same trace.
    assert seen
    assert seen[0]["traceparent"].split("-")[1] == TRACE_ID


def test_an_unreachable_engine_leaves_risks_pending_until_the_drain_retries(
    seed: Callable[[], None], risk_engine: FakeRiskEngine
) -> None:
    risk_engine.down = True
    seed()

    client = _manager()
    assert _risk(client, POWER)["residual"] is None
    pending = [d for d in _deliveries() if d.status == DeliveryStatus.PENDING]
    assert pending
    assert {d.last_error for d in pending} == {"RiskEngineUnavailableError"}

    risk_engine.down = False
    engine.reset_breaker()
    with tenant_context(tenant_ids()[0]):
        OutboxDelivery.objects.update(next_attempt_at=timezone.now() - timedelta(seconds=1))
    drain()

    assert _risk(client, POWER)["residual"] is not None


def test_recalculating_unchanged_inputs_changes_nothing(
    seed: Callable[[], None], risk_engine: FakeRiskEngine
) -> None:
    seed()
    with tenant_context(tenant_ids()[0]):
        before = Risk.objects.get(id=_uuid(POWER)).residual_calculated_at

        assert recalculate([_uuid(POWER)]) == 0
        assert Risk.objects.get(id=_uuid(POWER)).residual_calculated_at == before
        assert recalculate([]) == 0


def test_without_a_configured_engine_ratings_stay_pending(seed: Callable[[], None]) -> None:
    seed()

    assert _risk(_manager(), POWER)["residual"] is None
    with pytest.raises(engine.RiskEngineUnavailableError):
        engine.score([])
