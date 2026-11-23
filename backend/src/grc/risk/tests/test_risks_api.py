"""Risks and the risk matrix of the Demo Tenant, read through the API."""

import json
from io import StringIO
from typing import Any

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_ids
from grc.risk.models import Risk

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _fixture(name: str) -> Any:
    return json.loads((settings.SEED_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


@pytest.fixture
def client(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "auditor"}, content_type="application/json")
    return client


def _items(client: Client, query: str = "") -> list[dict[str, Any]]:
    response = client.get(f"{TENANT}/risks?limit=100{query}")
    assert response.status_code == 200, response.content
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def _rate(fixture_id: str, likelihood: int, impact: int, category: str) -> None:
    """Stores a Residual Rating as the risk engine's handler would."""
    with tenant_context(tenant_ids()[0]):
        Risk.objects.filter(id=_uuid(fixture_id)).update(
            residual_likelihood=likelihood,
            residual_impact=impact,
            residual_score=likelihood * impact,
            residual_category=category,
            method_version="qualitative-4x4/1",
        )


def test_risks_match_the_prototype_with_ratings_assets_and_treatments(client: Client) -> None:
    loaded = {r["id"]: r for r in _items(client)}
    fixtures = _fixture("risks")

    assert set(loaded) == {_uuid(r["id"]) for r in fixtures}
    for fixture in fixtures:
        risk = loaded[_uuid(fixture["id"])]
        assert risk["scope_id"] == _uuid(fixture["scope_id"])
        assert risk["hazard"]["id"] == _uuid(fixture["hazard_id"])
        assert risk["asset_ids"] == [_uuid(a) for a in fixture["asset_ids"]]
        assert [a["id"] for a in risk["assets"]] == risk["asset_ids"]
        assert risk["title_de"] == fixture["title_de"]
        inherent = fixture["inherent"]
        assert risk["inherent"]["score"] == inherent["likelihood"] * inherent["impact"]
        assert risk["treatments"] == [
            {**t, "implementation_id": _uuid(t["implementation_id"])} for t in fixture["treatments"]
        ]
        assert risk["owner_name"]
        # Nothing has asked the risk engine yet.
        assert risk["residual"] is None


def test_one_risk_and_an_unknown_one(client: Client) -> None:
    risk_id = _uuid("rk-n-power")

    assert client.get(f"{TENANT}/risks/{risk_id}").json()["id"] == risk_id
    assert client.get(f"{TENANT}/risks/{_uuid('rk-unknown')}").status_code == 404


def test_risks_filter_by_scope_and_asset(client: Client) -> None:
    north = _items(client, f"&scope={_uuid('sc-nord')}")
    wells = _items(client, f"&asset={_uuid('as-n-wells')}")

    assert {r["scope_id"] for r in north} == {_uuid("sc-nord")}
    assert all(_uuid("as-n-wells") in r["asset_ids"] for r in wells)
    assert wells
    assert _items(client, "&scope=nonsense") == []


def test_risks_filter_by_category_and_cell_of_a_rating(client: Client) -> None:
    critical = _items(client, "&rating=inherent&category=critical")
    cell = _items(client, "&rating=inherent&likelihood=3&impact=4")

    assert critical
    assert all(r["inherent"]["category"] == "critical" for r in critical)
    assert all((r["inherent"]["likelihood"], r["inherent"]["impact"]) == (3, 4) for r in cell)
    assert len(_items(client, "&category=pending")) == len(_fixture("risks"))


@pytest.mark.parametrize(
    "query",
    ["&rating=worst", "&category=pending&rating=inherent", "&category=huge", "&impact=5"],
)
def test_an_invalid_filter_is_refused(client: Client, query: str) -> None:
    response = client.get(f"{TENANT}/risks?{query}")

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_filter"


def test_ordering_puts_the_worst_residual_first_and_unrated_risks_last(client: Client) -> None:
    _rate("rk-n-flood", 1, 2, "low")
    _rate("rk-n-power", 3, 4, "critical")

    ordered = [r["id"] for r in _items(client, "&ordering=-residual_score")]

    assert ordered[:2] == [_uuid("rk-n-power"), _uuid("rk-n-flood")]
    unrated = _items(client, "&ordering=-residual_score")[2:]
    scores = [r["inherent"]["score"] for r in unrated]
    assert scores == sorted(scores, reverse=True)
    assert client.get(f"{TENANT}/risks?ordering=title").status_code == 400


def test_a_stored_residual_rating_is_shown_with_its_method(client: Client) -> None:
    _rate("rk-n-power", 2, 2, "medium")

    residual = client.get(f"{TENANT}/risks/{_uuid('rk-n-power')}").json()["residual"]

    assert residual == {
        "likelihood": 2,
        "impact": 2,
        "score": 4,
        "category": "medium",
        "method_version": "qualitative-4x4/1",
        "explanation": [],
    }


def test_the_matrix_counts_risks_per_cell_and_pending_ones(client: Client) -> None:
    _rate("rk-n-power", 3, 4, "critical")

    residual = client.get(f"{TENANT}/risk-matrix").json()
    inherent = client.get(f"{TENANT}/risk-matrix?rating=inherent").json()

    total = len(_fixture("risks"))
    assert residual == {
        "cells": [{"likelihood": 3, "impact": 4, "count": 1, "worst_category": "critical"}],
        "pending": total - 1,
        "total": total,
    }
    assert sum(c["count"] for c in inherent["cells"]) == total
    assert inherent["pending"] == 0
    assert client.get(f"{TENANT}/risk-matrix?rating=worst").status_code == 400


def test_the_matrix_follows_the_scope(client: Client) -> None:
    north = client.get(f"{TENANT}/risk-matrix?scope={_uuid('sc-nord')}").json()

    assert north["total"] == sum(1 for r in _fixture("risks") if r["scope_id"] == "sc-nord")
