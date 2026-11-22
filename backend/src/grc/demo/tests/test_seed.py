"""The Demo Tenant loads from the same fixtures the prototype serves, and answers alike.

Checked through the API only, the way the prototype's screens will read it.
"""

import json
from http import HTTPStatus
from io import StringIO
from typing import Any

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _fixture(name: str) -> Any:
    return json.loads((settings.SEED_DIR / f"{name}.json").read_text(encoding="utf-8"))


def _seed() -> None:
    call_command("seed_demo", stdout=StringIO())


def _demo_client(role: str) -> Client:
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
    return client


@pytest.fixture
def auditor(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    _seed()
    return _demo_client("auditor")


def _all(client: Client, path: str) -> list[dict[str, Any]]:
    joiner = "&" if "?" in path else "?"
    body = client.get(f"{TENANT}/{path}{joiner}limit=100").json()
    assert body["page"]["total"] <= 100
    items: list[dict[str, Any]] = body["items"]
    return items


def _snapshot(client: Client) -> tuple[Any, ...]:
    return tuple(
        _all(client, path) for path in ("frameworks", "requirements", "mappings", "members")
    )


def test_loading_twice_changes_nothing(auditor: Client) -> None:
    before = _snapshot(auditor)

    _seed()

    assert _snapshot(_demo_client("auditor")) == before


def test_the_demo_logins_sign_in_as_the_fixtures_people(auditor: Client) -> None:
    manager = _demo_client("grc_manager")

    assert auditor.get("/api/v1/me").json()["user"]["display_name"] == "Tobias Wolff"
    assert manager.get("/api/v1/me").json()["user"]["display_name"] == "Alex Kramer"


def test_loaded_people_have_no_password(auditor: Client) -> None:
    for person in _fixture("users"):
        response = Client().post(
            "/api/v1/auth/login",
            {"email": person["email"], "password": "anything-at-all"},
            content_type="application/json",
        )
        assert response.status_code == HTTPStatus.BAD_REQUEST


def test_members_match_the_prototype(auditor: Client) -> None:
    members = {(m["email"], m["role"], m["job_title"]) for m in _all(auditor, "members")}

    assert members == {(u["email"], u["role"], u["job_title"]) for u in _fixture("users")}


def test_frameworks_match_the_prototype(auditor: Client) -> None:
    assert _all(auditor, "frameworks") == _fixture("frameworks")


def test_requirements_match_the_prototype_in_statute_order(auditor: Client) -> None:
    expected = [
        {**r, "pending_legal_detail": r.get("pending_legal_detail")}
        for r in _fixture("requirements")
    ]

    assert _all(auditor, "requirements") == expected


def test_requirements_filter_by_version_paragraph_and_search(auditor: Client) -> None:
    by_paragraph = _all(auditor, "requirements?paragraph=%C2%A7%2013")
    bsig = _all(auditor, "requirements?framework_version=fv-bsig-2025-12")
    found = _all(auditor, "requirements?search=registrierung")

    assert by_paragraph
    assert {r["paragraph"] for r in by_paragraph} == {"§ 13"}
    assert {r["framework_version_id"] for r in bsig} == {"fv-bsig-2025-12"}
    assert "req-k-8-1" in [r["id"] for r in found]


def test_one_requirement_and_an_unknown_one(auditor: Client) -> None:
    one = auditor.get(f"{TENANT}/requirements/req-k-8-1")
    unknown = auditor.get(f"{TENANT}/requirements/nope")

    assert one.json()["citation"] == "§ 8 Abs. 1"
    assert unknown.status_code == HTTPStatus.NOT_FOUND


def test_mappings_match_the_prototype(auditor: Client) -> None:
    fixture_emails = {u["id"]: u["email"] for u in _fixture("users")}
    api_emails = {m["id"]: m["email"] for m in _all(auditor, "members")}

    def comparable(mapping: dict[str, Any], email_of: dict[str, str]) -> tuple[Any, ...]:
        approver = mapping["approved_by_id"]
        return (
            mapping["kind"],
            mapping["target_requirement_id"],
            mapping["source_requirement_id"],
            mapping["coverage"],
            mapping["justification_de"],
            mapping["gap_note_de"],
            email_of[approver] if approver else None,
        )

    actual = sorted(comparable(m, api_emails) for m in _all(auditor, "mappings"))
    assert actual == sorted(comparable(m, fixture_emails) for m in _fixture("mappings"))


def test_mappings_filter_by_target_and_source(auditor: Client) -> None:
    to_twelve = _all(auditor, "mappings?target_requirement=req-k-12-1")
    from_thirty = _all(auditor, "mappings?source_requirement=req-b-30-2-1")

    assert {m["target_requirement_id"] for m in to_twelve} == {"req-k-12-1"}
    assert {m["source_requirement_id"] for m in from_thirty} == {"req-b-30-2-1"}
