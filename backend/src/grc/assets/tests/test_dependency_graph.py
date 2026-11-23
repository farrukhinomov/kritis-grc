"""The dependency graph of the Demo Tenant's Critical Facilities, through the API."""

from io import StringIO
from typing import Any
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.assets.selectors import dependency_graph
from grc.core.actor import Actor
from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_id_for

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


def test_the_facility_and_everything_it_depends_on_across_scopes(client: Client) -> None:
    graph = _graph(client, "sc-nord")

    ids = {a["id"] for a in graph["assets"]}
    assert graph["scope"] == {"id": _uuid("sc-nord"), "name": "Wasserwerk Nord"}
    assert {_uuid(i) for i in ("as-n-plant", "as-dc", "as-grid", "as-chlorine")} <= ids
    assert _uuid("as-s-plant") not in ids  # Süd's Assets are not Nord's dependencies
    grid = _asset(graph, "as-grid")
    assert (grid["kind"], grid["scope_id"], grid["depends_on"]) == ("supplier", _uuid("sc-org"), [])
    assert grid["scope_name"]
    assert sorted(graph["roots"]) == sorted([_uuid("as-n-plant"), _uuid("as-n-reservoir")])


def test_every_edge_has_both_ends_in_the_graph(client: Client) -> None:
    graph = _graph(client, "sc-nord")

    ids = {a["id"] for a in graph["assets"]}
    assert all(set(a["depends_on"]) <= ids for a in graph["assets"])


def test_only_a_critical_facility_has_a_graph(client: Client) -> None:
    organization = client.get(f"{TENANT}/dependency-graph", {"scope": _uuid("sc-org")})
    nonsense = client.get(f"{TENANT}/dependency-graph", {"scope": "nonsense"})
    missing = client.get(f"{TENANT}/dependency-graph")

    assert (organization.status_code, nonsense.status_code) == (404, 404)
    assert missing.status_code == 400
    assert missing.json()["code"] == "invalid_filter"


def test_a_scope_limited_membership_sees_no_other_scopes_assets(client: Client) -> None:
    tenant_id = tenant_id_for("muster-stadtwerke")
    assert tenant_id is not None
    north = fixture_uuid("muster-stadtwerke", "sc-nord")
    actor = Actor(1, uuid4(), tenant_id, "grc_manager", scope_ids=frozenset({north}))

    with tenant_context(tenant_id):
        graph = dependency_graph(actor, north, {})

    assert graph is not None
    assert {a["scope_id"] for a in graph["assets"]} == {str(north)}
    assert all(_uuid("as-grid") not in a["depends_on"] for a in graph["assets"])
