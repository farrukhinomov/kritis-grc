"""The Risk overlay on the dependency graph of the Demo Tenant, through the API."""

from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_id_for
from grc.risk.models import Risk

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


@pytest.fixture
def client(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "auditor"}, content_type="application/json")
    return client


def _graph(client: Client, scope: str) -> Any:
    response = client.get(f"{TENANT}/dependency-graph", {"scope": _uuid(scope)})
    assert response.status_code == 200, response.content
    return response.json()


def _asset(graph: Any, fixture_id: str) -> Any:
    return next(a for a in graph["assets"] if a["id"] == _uuid(fixture_id))


def _rate_all(residual: tuple[int, int]) -> None:
    tenant_id = tenant_id_for("muster-stadtwerke")
    assert tenant_id is not None
    with tenant_context(tenant_id):
        Risk.objects.update(
            residual_likelihood=residual[0],
            residual_impact=residual[1],
            residual_score=residual[0] * residual[1],
            residual_category="high",
            method_version="qualitative-4x4/1",
        )


def test_the_overlay_counts_only_the_facilitys_own_risks(client: Client) -> None:
    _rate_all((2, 4))
    nord, sued = _graph(client, "sc-nord"), _graph(client, "sc-sued")

    wells = _asset(nord, "as-n-wells")
    assert wells["risks"] == {
        "count": 2,
        "highest": {"likelihood": 2, "impact": 4, "score": 8, "category": "high"},
    }
    # Both plants rely on the chlorine supplier, but only a Risk of Nord names it.
    assert _asset(nord, "as-chlorine")["risks"]["count"] == 1
    assert _asset(sued, "as-chlorine")["risks"]["count"] == 0
    assert _asset(nord, "as-grid")["risks"] == {"count": 0, "highest": None}


def test_the_highest_rating_is_unknown_while_a_risk_is_pending(client: Client) -> None:
    # Freshly loaded, no Residual Rating has been calculated yet.
    wells = _asset(_graph(client, "sc-nord"), "as-n-wells")

    assert wells["risks"] == {"count": 2, "highest": None}
