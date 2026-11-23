"""Mapping Suggestions of the Demo Tenant: reviewing and deciding them."""

import json
from io import StringIO
from typing import Any

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


def _fixture(name: str) -> Any:
    return json.loads((settings.SEED_DIR / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _demo(settings: Settings) -> None:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())


def _client(role: str) -> Client:
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
    return client


def _decide(client: Client, fixture_id: str, decision: str) -> Any:
    return client.post(f"{TENANT}/mapping-suggestions/{_uuid(fixture_id)}/{decision}")


def test_suggestions_match_the_prototype_pending_ones_in_statute_order() -> None:
    items = _client("auditor").get(f"{TENANT}/mapping-suggestions").json()["items"]

    fixtures = {_uuid(s["id"]): s for s in _fixture("mapping-suggestions")}
    assert {s["id"] for s in items} == set(fixtures)
    first = items[0]
    assert first["target"]["framework_name"] == "KRITIS-Dachgesetz"
    assert first["source"]["citation"].startswith("§")
    assert first["confidence"] == fixtures[first["id"]]["confidence"]
    assert {s["status"] for s in items} == {"pending"}
    positions = [s["target_requirement_id"] for s in items]
    requirements = [r["id"] for r in _fixture("requirements")]
    assert positions == sorted(positions, key=requirements.index)


def test_approving_creates_the_tenant_mapping_and_logs_the_decision() -> None:
    manager = _client("grc_manager")

    response = _decide(manager, "sug-1", "approve")

    assert response.status_code == 201, response.content
    mapping = response.json()
    assert (mapping["kind"], mapping["target_requirement_id"]) == ("tenant", "req-k-13-3-2")
    mappings = manager.get(f"{TENANT}/mappings?target_requirement=req-k-13-3-2").json()["items"]
    assert mapping["id"] in {m["id"] for m in mappings}
    decided = manager.get(f"{TENANT}/mapping-suggestions?status=approved").json()["items"]
    assert [(s["id"], s["decided_by_name"]) for s in decided] == [(_uuid("sug-1"), "Alex Kramer")]
    entry = manager.get(f"{TENANT}/activity?object_type=mapping_suggestion").json()["items"][0]
    assert entry["action"] == "approved"
    assert {"field": "status", "from": "pending", "to": "approved"} in entry["changes"]


def test_rejecting_answers_the_suggestion_and_deciding_twice_conflicts() -> None:
    manager = _client("grc_manager")

    rejected = _decide(manager, "sug-2", "reject")
    again = _decide(manager, "sug-2", "approve")

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert again.status_code == 409
    assert again.json()["code"] == "suggestion_already_decided"


def test_the_inbox_lists_suggestions_next_to_risk_assessments_oldest_first() -> None:
    inbox = _client("grc_manager").get(f"{TENANT}/approvals").json()

    kinds = [item["kind"] for item in inbox["items"]]
    assert kinds.count("mapping_suggestion") == len(_fixture("mapping-suggestions"))
    assert "risk_assessment" in kinds
    times = [item["submitted_at"] for item in inbox["items"]]
    assert times == sorted(times)


def test_an_auditor_cant_decide_and_a_filter_typo_is_refused() -> None:
    auditor = _client("auditor")

    assert _decide(auditor, "sug-1", "approve").status_code == 403
    assert auditor.get(f"{TENANT}/mapping-suggestions?status=open").status_code == 400
