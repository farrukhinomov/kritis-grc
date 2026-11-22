import json
from collections import Counter
from collections.abc import Callable
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


@pytest.fixture
def login(settings: Settings) -> Callable[[str], Client]:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())

    def as_role(role: str) -> Client:
        client = Client()
        client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
        return client

    return as_role


def _items(client: Client, query: str = "") -> list[dict[str, Any]]:
    response = client.get(f"{TENANT}/implementations?limit=100&{query}")
    assert response.status_code == HTTPStatus.OK, response.json()
    items: list[dict[str, Any]] = response.json()["items"]
    return items


def _patch(client: Client, item: dict[str, Any], change: Any, version: Any = "auto") -> Any:
    headers = {}
    if version == "auto":
        headers["If-Match"] = f'"{item["version"]}"'
    elif version is not None:
        headers["If-Match"] = version
    return client.patch(
        f"{TENANT}/implementations/{item['id']}",
        json.dumps(change),
        content_type="application/json",
        headers=headers,
    )


def test_implementations_match_the_prototype(login: Callable[[str], Client]) -> None:
    client = login("auditor")
    scopes = {s["id"]: s["name"] for s in client.get(f"{TENANT}/scopes").json()["items"]}
    members = {m["id"]: m["email"] for m in client.get(f"{TENANT}/members").json()["items"]}
    fixture_scopes = {s["id"]: s["name"] for s in _fixture("scopes")}
    fixture_people = {u["id"]: u["email"] for u in _fixture("users")}

    def comparable(row: dict[str, Any], scope_of: Any, person_of: Any) -> tuple[Any, ...]:
        owner = row["owner_id"]
        return (
            row["requirement_id"],
            scope_of[row["scope_id"]],
            row["status"],
            person_of[owner] if owner else None,
            row["due_date"],
            row["note_de"],
            row["version"],
        )

    actual = sorted(comparable(r, scopes, members) for r in _items(client))
    expected = sorted(
        comparable(r, fixture_scopes, fixture_people) for r in _fixture("implementations")
    )
    assert actual == expected


def test_filters_narrow_the_list(login: Callable[[str], Client]) -> None:
    client = login("auditor")
    nord = next(
        s["id"]
        for s in client.get(f"{TENANT}/scopes").json()["items"]
        if s["name"] == "Wasserwerk Nord"
    )

    in_nord = _items(client, f"scope={nord}")
    open_or_partial = _items(client, "status=open,partial")
    bsig = _items(client, "framework_version=fv-bsig-2025-12")
    paragraph = _items(client, "paragraph=%C2%A7%2013")

    assert in_nord
    assert {i["scope_id"] for i in in_nord} == {nord}
    assert {i["status"] for i in open_or_partial} <= {"open", "partial"}
    assert all(i["requirement_id"].startswith("req-b-") for i in bsig)
    assert all(i["requirement_id"].startswith("req-k-13") for i in paragraph)


def test_owner_filter_and_owner_name(login: Callable[[str], Client]) -> None:
    client = login("auditor")
    owned = [i for i in _items(client) if i["owner_id"]]
    owner = owned[0]["owner_id"]

    mine = _items(client, f"owner={owner}")

    assert {i["owner_id"] for i in mine} == {owner}
    assert all(i["owner_name"] for i in mine)


def test_ordering_by_due_date_keeps_undated_work_last(login: Callable[[str], Client]) -> None:
    dates = [i["due_date"] for i in _items(login("auditor"), "ordering=due_date")]

    dated = [d for d in dates if d]
    assert dated == sorted(dated)
    assert dates[: len(dated)] == dated


@pytest.mark.parametrize(
    ("query", "code"), [("status=done", "invalid_filter"), ("ordering=name", "invalid_ordering")]
)
def test_unknown_filters_are_refused(login: Callable[[str], Client], query: str, code: str) -> None:
    response = login("auditor").get(f"{TENANT}/implementations?{query}")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["code"] == code


def test_one_implementation_carries_its_version_as_etag(login: Callable[[str], Client]) -> None:
    client = login("auditor")
    item = _items(client)[0]

    response = client.get(f"{TENANT}/implementations/{item['id']}")

    assert response.json() == item
    assert response["ETag"] == f'"{item["version"]}"'


def test_a_manager_changes_the_status_and_the_version_moves_on(
    login: Callable[[str], Client],
) -> None:
    client = login("grc_manager")
    item = next(i for i in _items(client) if i["status"] == "open")

    response = _patch(client, item, {"status": "implemented", "note_de": "Erledigt."})

    changed = response.json()
    assert response.status_code == HTTPStatus.OK
    assert (changed["status"], changed["note_de"]) == ("implemented", "Erledigt.")
    assert changed["version"] == item["version"] + 1
    assert response["ETag"] == f'"{changed["version"]}"'
    assert changed["updated_at"] != item["updated_at"]


def test_a_stale_version_is_refused(login: Callable[[str], Client]) -> None:
    client = login("grc_manager")
    item = _items(client)[0]
    _patch(client, item, {"note_de": "Erste Änderung."})

    late = _patch(client, item, {"note_de": "Zweite Änderung."})

    assert late.status_code == HTTPStatus.PRECONDITION_FAILED
    assert late.json()["code"] == "version_conflict"


def test_a_change_needs_if_match(login: Callable[[str], Client]) -> None:
    client = login("grc_manager")
    item = _items(client)[0]

    missing = _patch(client, item, {"status": "open"}, version=None)
    garbled = _patch(client, item, {"status": "open"}, version="seven")

    assert missing.status_code == HTTPStatus.PRECONDITION_REQUIRED
    assert garbled.status_code == HTTPStatus.BAD_REQUEST


def test_saving_without_a_change_keeps_the_version(login: Callable[[str], Client]) -> None:
    client = login("grc_manager")
    item = _items(client)[0]

    same = _patch(client, item, {"status": item["status"]})

    assert same.json()["version"] == item["version"]


def test_the_owner_can_be_set_and_cleared(login: Callable[[str], Client]) -> None:
    client = login("grc_manager")
    member = client.get(f"{TENANT}/members").json()["items"][0]
    item = _items(client)[0]

    owned = _patch(client, item, {"owner_id": member["id"]}).json()
    cleared = _patch(client, owned, {"owner_id": None}).json()

    assert (owned["owner_id"], owned["owner_name"]) == (member["id"], member["display_name"])
    assert (cleared["owner_id"], cleared["owner_name"]) == (None, None)


@pytest.mark.parametrize(
    ("change", "field", "code"),
    [
        ({"colour": "red"}, "colour", "unknown_field"),
        ({"status": "done"}, "status", "invalid_choice"),
        ({"owner_id": "999999"}, "owner_id", "invalid_choice"),
        ({"owner_id": "u-kramer"}, "owner_id", "invalid_choice"),
        ({"due_date": "tomorrow"}, "due_date", "invalid_date"),
        ({"note_de": "x" * 2001}, "note_de", "too_long"),
    ],
)
def test_invalid_changes_are_explained_by_field(
    login: Callable[[str], Client], change: dict[str, Any], field: str, code: str
) -> None:
    client = login("grc_manager")

    response = _patch(client, _items(client)[0], change)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["errors"] == [{"field": field, "code": code}]


def test_an_auditor_cant_change_implementations(login: Callable[[str], Client]) -> None:
    client = login("auditor")

    response = _patch(client, _items(client)[0], {"status": "implemented"})

    assert response.status_code == HTTPStatus.FORBIDDEN


def test_works_under_row_level_security(
    login: Callable[[str], Client], as_application_role: Callable[[], None]
) -> None:
    client = login("grc_manager")
    item = _items(client)[0]
    as_application_role()

    response = _patch(client, item, {"note_de": "Unter RLS."})

    assert response.status_code == HTTPStatus.OK
    assert len(_items(client)) == len(_fixture("implementations"))


def test_the_summary_counts_every_implementation_per_scope_and_framework(
    login: Callable[[str], Client],
) -> None:
    rows = login("auditor").get(f"{TENANT}/compliance-summary").json()["rows"]

    total = Counter[str]()
    for row in rows:
        total.update(row["counts"])
    assert total == Counter(i["status"] for i in _fixture("implementations"))
    assert {(r["scope_kind"], r["framework_id"]) for r in rows} >= {
        ("critical_facility", "fw-kritisdachg"),
        ("organization", "fw-bsig"),
    }


def test_paragraph_counts_follow_the_statute(login: Callable[[str], Client]) -> None:
    client = login("auditor")
    nord = next(
        s["id"]
        for s in client.get(f"{TENANT}/scopes").json()["items"]
        if s["name"] == "Wasserwerk Nord"
    )

    rows = client.get(
        f"{TENANT}/compliance-paragraphs?framework_version=fv-kritisdachg-2026-07&scope={nord}"
    ).json()["rows"]
    missing = client.get(f"{TENANT}/compliance-paragraphs?scope={nord}")

    paragraphs = [r["paragraph"] for r in rows]
    assert paragraphs == sorted(paragraphs, key=lambda p: int(p.split()[1].rstrip("abc")))
    thirteen = next(r for r in rows if r["paragraph"] == "§ 13")
    assert thirteen["requirement_count"] == sum(
        1 for r in _fixture("requirements") if r["paragraph"] == "§ 13"
    )
    assert missing.status_code == HTTPStatus.BAD_REQUEST
    assert missing.json()["code"] == "missing_filter"
