import json
from collections.abc import Callable
from datetime import date, timedelta
from http import HTTPStatus
from io import StringIO
from typing import Any

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from django.utils import timezone
from pytest_django.fixtures import Settings

from grc.core.tenancy import tenant_context
from grc.organization.models import (
    IdempotencyRecord,
    Membership,
    MembershipScope,
    Role,
    Scope,
    Tenant,
    User,
)
from grc.organization.selectors.legal import add_months

pytestmark = pytest.mark.django_db

SCOPES = "/api/v1/tenants/muster-stadtwerke/scopes"


@pytest.fixture
def demo(settings: Settings) -> Callable[[str], Client]:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())

    def login(role: str) -> Client:
        client = Client()
        client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
        return client

    return login


def _new(**changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "  Wasserwerk Ost ",
        "location": "Musterstadt-Ost",
        "critical_facility": {
            "sector": "water",
            "critical_service": "drinking_water_supply",
            "people_supplied": 600_000,
            "registration": {"status": "planned", "date": "2099-01-31"},
        },
    }
    body.update(changes)
    return body


def _post(client: Client, body: Any, key: str | None = None) -> Any:
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(SCOPES, json.dumps(body), content_type="application/json", headers=headers)


def test_scopes_match_the_prototype_with_projected_deadlines(
    demo: Callable[[str], Client],
) -> None:
    fixture = json.loads((settings.SEED_DIR / "scopes.json").read_text(encoding="utf-8"))

    items = demo("auditor").get(SCOPES).json()["items"]

    by_name = {s["name"]: s for s in items}
    assert set(by_name) == {s["name"] for s in fixture}
    nord = by_name["Wasserwerk Nord"]["critical_facility"]
    assert nord["registration"] == {"status": "planned", "date": "2027-01-15"}
    assert nord["deadlines"] == [
        {"citation": "§ 12", "due_date": "2027-10-15", "binding": False},
        {"citation": "§ 13", "due_date": "2027-11-15", "binding": False},
        {"citation": "§ 18", "due_date": "2027-11-15", "binding": False},
        {"citation": "§ 20", "due_date": "2027-11-15", "binding": False},
    ]
    assert by_name["Muster-Stadtwerke Saar GmbH (gesamt)"]["critical_facility"] is None


def test_scopes_filter_by_kind(demo: Callable[[str], Client]) -> None:
    client = demo("auditor")

    facilities = client.get(f"{SCOPES}?kind=critical_facility").json()["items"]
    unknown = client.get(f"{SCOPES}?kind=planet")

    assert {s["kind"] for s in facilities} == {"critical_facility"}
    assert len(facilities) == 2
    assert unknown.status_code == HTTPStatus.BAD_REQUEST
    assert unknown.json()["code"] == "invalid_filter"


def test_one_scope_by_id(demo: Callable[[str], Client]) -> None:
    client = demo("auditor")
    first = client.get(SCOPES).json()["items"][0]

    assert client.get(f"{SCOPES}/{first['id']}").json() == first


def test_a_manager_adds_a_critical_facility_with_the_laws_threshold(
    demo: Callable[[str], Client],
) -> None:
    response = _post(demo("grc_manager"), _new())

    assert response.status_code == HTTPStatus.CREATED
    created = response.json()
    assert created["name"] == "Wasserwerk Ost"
    assert created["critical_facility"]["threshold"] == 500_000
    assert created["critical_facility"]["deadlines"][0] == {
        "citation": "§ 12",
        "due_date": "2099-10-31",
        "binding": False,
    }


def test_a_retry_with_the_same_key_gets_the_first_answer(demo: Callable[[str], Client]) -> None:
    client = demo("grc_manager")

    first = _post(client, _new(), key="k-1")
    again = _post(client, _new(), key="k-1")
    other = _post(client, _new(name="Wasserwerk West"), key="k-1")

    assert again.status_code == HTTPStatus.CREATED
    assert again.json() == first.json()
    assert again["Idempotent-Replayed"] == "true"
    assert other.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert other.json()["code"] == "idempotency_key_reused"
    assert len(client.get(f"{SCOPES}?kind=critical_facility").json()["items"]) == 3


@pytest.mark.parametrize(
    ("facility", "field", "code"),
    [
        ({"people_supplied": 400_000}, "critical_facility.people_supplied", "below_threshold"),
        ({"people_supplied": 0}, "critical_facility.people_supplied", "invalid"),
        ({"critical_service": "bread"}, "critical_facility.critical_service", "invalid_choice"),
        (
            {"registration": {"status": "confirmed", "date": "2099-01-01"}},
            "critical_facility.registration.status",
            "invalid_choice",
        ),
        (
            {"registration": {"status": "planned", "date": "soon"}},
            "critical_facility.registration.date",
            "invalid_date",
        ),
        (
            {"registration": {"status": "planned", "date": "2020-01-01"}},
            "critical_facility.registration.date",
            "in_past",
        ),
    ],
)
def test_an_invalid_facility_is_explained_by_field(
    demo: Callable[[str], Client], facility: dict[str, Any], field: str, code: str
) -> None:
    body = _new()
    body["critical_facility"].update(facility)

    response = _post(demo("grc_manager"), body)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert {"field": field, "code": code} in response.json()["errors"]


def test_names_are_required_and_bounded(demo: Callable[[str], Client]) -> None:
    response = _post(demo("grc_manager"), _new(name="", location="x" * 201))

    assert response.json()["errors"] == [
        {"field": "name", "code": "required"},
        {"field": "location", "code": "too_long"},
    ]


def test_an_auditor_cant_add_facilities(demo: Callable[[str], Client]) -> None:
    response = _post(demo("auditor"), _new())

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["code"] == "permission_denied"


def test_a_scope_limited_member_sees_only_their_scopes() -> None:
    north = Tenant.objects.create(slug="north", name="North")
    user = User.objects.create_user("limited@example.org")
    with tenant_context(north.id):
        mine = Scope.objects.create(name="Mine")
        Scope.objects.create(name="Not mine")
        membership = Membership.objects.create(tenant=north, user=user, role=Role.AUDITOR)
        MembershipScope.objects.create(membership=membership, scope=mine)
    client = Client()
    client.force_login(user)

    names = [s["name"] for s in client.get("/api/v1/tenants/north/scopes").json()["items"]]

    assert names == ["Mine"]


def test_critical_services_name_their_threshold(demo: Callable[[str], Client]) -> None:
    items = demo("auditor").get("/api/v1/tenants/muster-stadtwerke/critical-services").json()

    assert items["items"] == [
        {
            "sector": "water",
            "critical_service": "drinking_water_supply",
            "measure": "people_supplied",
            "threshold": 500_000,
            "threshold_basis": "statutory_default",
            "citation": "§ 5 Abs. 2",
        }
    ]


@pytest.mark.parametrize(
    ("start", "months", "expected"),
    [
        (date(2027, 1, 31), 1, date(2027, 2, 28)),
        (date(2028, 1, 31), 1, date(2028, 2, 29)),
        (date(2027, 1, 15), 9, date(2027, 10, 15)),
        (date(2027, 11, 30), 3, date(2028, 2, 29)),
    ],
)
def test_months_are_added_by_the_calendar(start: date, months: int, expected: date) -> None:
    assert add_months(start, months) == expected


def test_idempotency_keys_must_be_sensible(demo: Callable[[str], Client]) -> None:
    response = _post(demo("grc_manager"), _new(), key="x" * 201)

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["code"] == "invalid_idempotency_key"


def test_old_idempotency_keys_are_forgotten(demo: Callable[[str], Client]) -> None:
    client = demo("grc_manager")
    _post(client, _new(), key="old")
    tenant = Tenant.objects.get(slug="muster-stadtwerke")
    with tenant_context(tenant.id):
        IdempotencyRecord.objects.update(created_at=timezone.now() - timedelta(days=2))

    again = _post(client, _new(name="Wasserwerk West"), key="old")

    assert again.status_code == HTTPStatus.CREATED
