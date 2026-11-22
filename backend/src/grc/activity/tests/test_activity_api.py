import json
from collections.abc import Callable
from http import HTTPStatus
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.db import InternalError, ProgrammingError, connection, transaction
from django.test import Client
from pytest_django.fixtures import Settings

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


@pytest.fixture
def login(settings: Settings) -> Callable[[str], Client]:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())

    def as_role(role: str) -> Client:
        client = Client()
        client.post("/api/v1/auth/demo-login", {"role": role}, content_type="application/json")
        return client

    return as_role


def _implementation(client: Client, scope_name: str = "Wasserwerk Nord") -> dict[str, Any]:
    scope = next(
        s["id"] for s in client.get(f"{TENANT}/scopes").json()["items"] if s["name"] == scope_name
    )
    item: dict[str, Any] = client.get(f"{TENANT}/implementations?scope={scope}").json()["items"][0]
    return item


def _patch(client: Client, item: dict[str, Any], change: dict[str, Any]) -> dict[str, Any]:
    response = client.patch(
        f"{TENANT}/implementations/{item['id']}",
        json.dumps(change),
        content_type="application/json",
        headers={"If-Match": f'"{item["version"]}"'},
    )
    body: dict[str, Any] = response.json()
    return body


def _log(client: Client, query: str = "") -> dict[str, Any]:
    response = client.get(f"{TENANT}/activity?{query}")
    assert response.status_code == HTTPStatus.OK, response.json()
    body: dict[str, Any] = response.json()
    return body


def test_loading_the_demo_is_recorded_but_not_listed(login: Callable[[str], Client]) -> None:
    assert _log(login("auditor"))["items"] == []


def test_a_status_change_names_who_what_and_from_which_value(
    login: Callable[[str], Client],
) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    _patch(manager, item, {"status": "not_applicable"})

    entry = _log(login("auditor"))["items"][0]

    assert entry["action"] == "updated"
    assert entry["actor_name"] == "Alex Kramer"
    assert entry["object_type"] == "implementation"
    assert entry["object_id"] == item["id"]
    assert entry["object_label"].endswith(" · Wasserwerk Nord")
    assert entry["object_label"].startswith("§ ")
    assert entry["changes"] == [{"field": "status", "from": item["status"], "to": "not_applicable"}]


def test_owner_changes_are_shown_by_name(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    becker = next(
        m
        for m in manager.get(f"{TENANT}/members").json()["items"]
        if m["display_name"] == "Jana Becker"
    )
    _patch(manager, item, {"owner_id": becker["id"]})

    change = _log(manager)["items"][0]["changes"]

    assert change[0]["field"] == "owner"
    assert change[0]["to"] == "Jana Becker"


def test_evidence_added_and_removed_is_recorded(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    path = f"{TENANT}/implementations/{item['id']}/evidence"
    created = manager.post(
        path,
        {"kind": "link", "title": "Richtlinie", "url": "https://example.org"},
        content_type="application/json",
    ).json()
    manager.delete(f"{path}/{created['id']}")

    entries = _log(manager, f"object_id={created['id']}")["items"]

    assert [(e["action"], e["object_label"]) for e in entries] == [
        ("deleted", "Richtlinie"),
        ("created", "Richtlinie"),
    ]


def test_the_log_is_paged_by_cursor_newest_first(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    for note in ("eins", "zwei", "drei"):
        item = _patch(manager, item, {"note_de": note})

    first = _log(manager, "limit=2")
    rest = _log(manager, f"limit=2&cursor={first['page']['next_cursor']}")

    notes = [e["changes"][0]["to"] for e in first["items"] + rest["items"]]
    assert notes == ["drei", "zwei", "eins"]
    assert rest["page"]["next_cursor"] is None


def test_filters_by_type_and_action(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    _patch(manager, _implementation(manager), {"note_de": "x"})

    assert len(_log(manager, "object_type=implementation&action=updated")["items"]) == 1
    assert _log(manager, "object_type=evidence")["items"] == []
    assert _log(manager, "action=approved")["items"] == []


@pytest.mark.parametrize(
    ("query", "code"),
    [
        ("cursor=bm9wZQ", "invalid_cursor"),
        ("action=exploded", "invalid_filter"),
        ("limit=0", "invalid_pagination"),
    ],
)
def test_bad_queries_are_refused(login: Callable[[str], Client], query: str, code: str) -> None:
    response = login("auditor").get(f"{TENANT}/activity?{query}")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["code"] == code


def test_a_bulk_update_is_recorded_too(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    _patch(manager, item, {"note_de": "per API"})

    with connection.cursor() as cursor:
        # As if someone bypassed the API entirely; the trigger still records it.
        cursor.execute(
            "SELECT set_config('pghistory.context_metadata', '{\"user\": 1}', true);"
            "UPDATE compliance_implementation SET note_de = 'per SQL' WHERE id = %s",
            [item["id"]],
        )
        cursor.execute(
            "SELECT count(*) FROM compliance_implementationevent WHERE pgh_obj_id = %s",
            [item["id"]],
        )
        recorded = cursor.fetchone()[0]

    assert recorded >= 3  # created by the seed, changed per API, changed per SQL


def test_the_log_cannot_be_changed_or_deleted(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    _patch(manager, _implementation(manager), {"note_de": "x"})

    for statement in (
        "UPDATE compliance_implementationevent SET note_de = 'forged'",
        "DELETE FROM compliance_implementationevent",
    ):
        with (
            pytest.raises((ProgrammingError, InternalError), match="immutable"),
            transaction.atomic(),
            connection.cursor() as cursor,
        ):
            cursor.execute(statement)


def test_only_a_purge_may_delete_entries(login: Callable[[str], Client]) -> None:
    with transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("SET LOCAL app.allow_activity_purge = 'on'")
        cursor.execute("DELETE FROM compliance_implementationevent")
        cursor.execute("SELECT count(*) FROM compliance_implementationevent")
        assert cursor.fetchone()[0] == 0


def test_works_under_row_level_security(
    login: Callable[[str], Client], as_application_role: Callable[[], None]
) -> None:
    manager = login("grc_manager")
    item = _implementation(manager)
    as_application_role()

    _patch(manager, item, {"note_de": "RLS"})

    change = _log(manager)["items"][0]["changes"][0]
    assert (change["field"], change["to"]) == ("note_de", "RLS")
