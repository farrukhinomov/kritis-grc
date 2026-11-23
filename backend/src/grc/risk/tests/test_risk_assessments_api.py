"""Risk Assessments of the Demo Tenant: reading them and deciding under four eyes."""

from io import StringIO
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_ids
from grc.risk.models import RiskAssessment

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"
SUBMITTED = "ra-n-2026"  # submitted by Deniz Yilmaz, waiting for approval
APPROVED = "ra-s-2025"


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


@pytest.fixture(autouse=True)
def _demo(settings: Settings) -> None:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())


def _demo_client(role: str) -> Client:
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
    return client


def _as(email: str) -> Client:
    client = Client()
    client.force_login(get_user_model().objects.get(email=email))
    return client


def _decide(client: Client, fixture_id: str, decision: str, body: dict[str, Any]) -> Any:
    return client.post(
        f"{TENANT}/risk-assessments/{_uuid(fixture_id)}/{decision}",
        body,
        content_type="application/json",
    )


def test_assessments_are_listed_newest_first_with_their_risks() -> None:
    items = _demo_client("auditor").get(f"{TENANT}/risk-assessments").json()["items"]

    assert [a["id"] for a in items] == [_uuid(SUBMITTED), _uuid(APPROVED)]
    assert items[0]["risk_ids"][0] == _uuid("rk-n-power")
    # The fixture spells the name with a Turkish dotless i.
    assert items[0]["submitted_by_name"] == "Deniz Y\u0131lmaz"
    assert items[0]["next_due"] is None
    # Approved on 2025-11-03: due again four years later.
    assert items[1]["next_due"] == "2029-11-03"
    assert items[1]["decided_by_name"] == "Alex Kramer"


def test_assessments_filter_by_status_and_scope() -> None:
    client = _demo_client("auditor")

    submitted = client.get(f"{TENANT}/risk-assessments?status=submitted").json()["items"]
    south = client.get(f"{TENANT}/risk-assessments?scope={_uuid('sc-sued')}").json()["items"]
    unknown = client.get(f"{TENANT}/risk-assessments?status=pending")

    assert [a["id"] for a in submitted] == [_uuid(SUBMITTED)]
    assert [a["id"] for a in south] == [_uuid(APPROVED)]
    assert unknown.status_code == 400
    assert unknown.json()["code"] == "invalid_filter"


def test_another_grc_manager_approves_and_the_activity_log_shows_it() -> None:
    manager = _demo_client("grc_manager")

    response = _decide(manager, SUBMITTED, "approve", {})

    assert response.status_code == 200, response.content
    body = response.json()
    assert (body["status"], body["decided_by_name"]) == ("approved", "Alex Kramer")
    assert body["next_due"] == "2030-10-20"
    entry = manager.get(f"{TENANT}/activity?object_type=risk_assessment").json()["items"][0]
    assert (entry["action"], entry["object_label"]) == ("approved", body["title_de"])
    assert {"field": "status", "from": "submitted", "to": "approved"} in entry["changes"]


def test_a_rejection_needs_a_reason() -> None:
    manager = _demo_client("grc_manager")

    missing = _decide(manager, SUBMITTED, "reject", {"note_de": "  "})
    rejected = _decide(manager, SUBMITTED, "reject", {"note_de": "Szenario Dürre fehlt."})

    assert missing.status_code == 422
    assert missing.json()["errors"] == [{"field": "note_de", "code": "required"}]
    assert rejected.status_code == 200
    assert rejected.json()["decision_note_de"] == "Szenario Dürre fehlt."


def test_nobody_decides_their_own_submission() -> None:
    author = _as("deniz.yilmaz@example.com")

    response = _decide(author, SUBMITTED, "approve", {})

    assert response.status_code == 403
    assert response.json()["code"] == "own_submission"


def test_a_decision_is_final() -> None:
    response = _decide(_demo_client("grc_manager"), APPROVED, "reject", {"note_de": "Spät."})

    assert response.status_code == 409
    assert response.json()["code"] == "already_decided"


def test_an_auditor_cant_decide() -> None:
    assert _decide(_demo_client("auditor"), SUBMITTED, "approve", {}).status_code == 403


def test_the_database_enforces_four_eyes_too() -> None:
    with tenant_context(tenant_ids()[0]):
        assessment = RiskAssessment.objects.get(id=_uuid(SUBMITTED))
        assessment.status = "approved"
        assessment.decided_by_id = assessment.submitted_by_id
        assessment.decided_at = assessment.submitted_at

        with pytest.raises(IntegrityError, match="four_eyes"):
            assessment.save()


def test_the_inbox_lists_what_the_caller_may_decide() -> None:
    manager = _demo_client("grc_manager").get(f"{TENANT}/approvals").json()
    author = _as("deniz.yilmaz@example.com").get(f"{TENANT}/approvals").json()
    auditor = _demo_client("auditor").get(f"{TENANT}/approvals").json()

    assert manager["total"] == 1
    assert manager["items"][0] == {
        "kind": "risk_assessment",
        "id": _uuid(SUBMITTED),
        "title": "Risikobewertung Wasserwerk Nord 2026",
        "detail": "Wasserwerk Nord",
        "scope_id": _uuid("sc-nord"),
        "submitted_by_name": manager["items"][0]["submitted_by_name"],
        "submitted_at": "2026-10-21T14:05:00Z",
    }
    # Four eyes: the author's own submission never waits for the author.
    assert author == {"items": [], "total": 0}
    assert auditor == {"items": [], "total": 0}
