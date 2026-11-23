"""The coverage matrix of KRITIS-DachG by BSIG, for the Demo Tenant, through the API."""

from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.compliance.models import Implementation
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


def _matrix(client: Client) -> Any:
    response = client.get(f"{TENANT}/coverage-matrix")
    assert response.status_code == 200, response.content
    return response.json()


def _cell(matrix: Any, target: str) -> Any:
    return next(c for c in matrix["cells"] if c["target_requirement_id"] == target)


def test_rows_and_columns_are_the_two_frameworks_in_statute_order(client: Client) -> None:
    matrix = _matrix(client)

    assert len(matrix["rows"]) == 16
    assert len(matrix["columns"]) == 14
    assert matrix["rows"][0]["citation"] == "§ 8 Abs. 1"
    assert matrix["rows"][-1]["citation"] == "§ 20 Abs. 1"
    # Statute order, not text order: Nr. 10 comes after Nr. 9.
    assert [c["citation"] for c in matrix["columns"][8:10]] == [
        "§ 30 Abs. 2 Nr. 9",
        "§ 30 Abs. 2 Nr. 10",
    ]
    assert {r["framework_key"] for r in matrix["rows"]} == {"kritis_dachg"}
    assert {c["framework_key"] for c in matrix["columns"]} == {"bsig"}


def test_a_cell_is_rated_by_its_strongest_mapping_the_tenants_own_first(client: Client) -> None:
    cell = _cell(_matrix(client), "req-k-13-3-5")

    assert cell["coverage"] == "full"
    assert [(m["kind"], m["coverage"]) for m in cell["mappings"]] == [
        ("tenant", "full"),
        ("platform", "partial"),
    ]


def test_reuse_needs_a_full_mapping_and_a_reference_to_implemented_work(client: Client) -> None:
    matrix = _matrix(client)

    assert _cell(matrix, "req-k-13-3-5")["reused_in"] == [
        {"scope_id": _uuid("sc-sued"), "scope_name": "Wasserwerk Süd"}
    ]
    # Both facilities refer to the BSIG Implementation here, but the Mapping is partial.
    assert _cell(matrix, "req-k-13-3-3")["reused_in"] == []
    assert matrix["totals"] == {"cells": 8, "full": 1, "partial": 7, "reused": 1}


def test_a_reference_to_unfinished_bsig_work_is_not_reuse(client: Client) -> None:
    tenant_id = tenant_id_for("muster-stadtwerke")
    assert tenant_id is not None
    with tenant_context(tenant_id):
        Implementation.objects.filter(id=_uuid("im-041")).update(status="partial")

    assert _cell(_matrix(client), "req-k-13-3-5")["reused_in"] == []
