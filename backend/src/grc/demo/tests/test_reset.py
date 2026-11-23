"""The nightly reset puts the Demo Tenant back exactly as its fixtures describe it."""

from collections.abc import Callable
from io import StringIO
from typing import Any
from uuid import uuid4

import pytest
from django.core.management import CommandError, call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.core.testing.storage import MemoryStorage
from grc.organization.selectors import tenant_id_for
from grc.organization.services import load_tenant

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


@pytest.fixture
def reset(django_capture_on_commit_callbacks: Callable[..., Any]) -> Callable[[], None]:
    def run() -> None:
        with django_capture_on_commit_callbacks(execute=True):
            call_command("reset_demo", stdout=StringIO())

    return run


@pytest.fixture
def manager(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "grc_manager"}, content_type="application/json")
    return client


def _snapshot(client: Client) -> dict[str, Any]:
    def items(path: str) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = client.get(f"{TENANT}/{path}?limit=100").json()["items"]
        return found

    return {
        path: items(path)
        for path in (
            "implementations",
            "risk-assessments",
            "mapping-suggestions",
            "mappings",
            "scopes",
            "risks",
        )
    }


# Real commits per request, as in production: inside one test transaction, the acting
# person a request names for the Activity Log would still be named during the reload.
@pytest.mark.django_db(transaction=True)
def test_a_visitors_changes_and_their_traces_are_gone_after_the_reset(
    manager: Client, reset: Callable[[], None]
) -> None:
    before = _snapshot(manager)
    implementation = manager.get(f"{TENANT}/implementations/{_uuid('im-015')}")
    manager.patch(
        f"{TENANT}/implementations/{_uuid('im-015')}",
        {"status": "implemented", "note_de": "Ausprobiert"},
        content_type="application/json",
        headers={"If-Match": implementation["ETag"]},
    )
    manager.post(f"{TENANT}/risk-assessments/{_uuid('ra-n-2026')}/approve", {})
    manager.post(f"{TENANT}/mapping-suggestions/{_uuid('sug-1')}/approve")
    assert manager.get(f"{TENANT}/activity").json()["items"]

    reset()

    fresh = Client()
    fresh.post("/api/v1/auth/demo-login", {"role": "grc_manager"}, content_type="application/json")
    after = _snapshot(fresh)
    # A changed version or timestamp would also show up here.
    assert after == before
    assert fresh.get(f"{TENANT}/activity").json()["items"] == []


def test_visitors_are_signed_out(manager: Client, reset: Callable[[], None]) -> None:
    reset()

    assert manager.get("/api/v1/me").status_code == 401


def test_the_demo_tenants_files_go_and_other_tenants_stay(
    manager: Client, reset: Callable[[], None]
) -> None:
    demo = tenant_id_for("muster-stadtwerke")
    MemoryStorage.put(f"tenants/{demo}/uploads/{uuid4()}", b"%PDF", "application/pdf")
    other_key = f"tenants/{uuid4()}/uploads/{uuid4()}"
    MemoryStorage.put(other_key, b"%PDF", "application/pdf")

    reset()

    assert list(MemoryStorage.objects) == [other_key]


def test_another_tenant_is_untouched(manager: Client, reset: Callable[[], None]) -> None:
    other, _ = load_tenant({"slug": "nordwerk", "name": "Nordwerk"}, [])

    reset()

    assert tenant_id_for("nordwerk") == other.id


def test_a_real_tenant_is_never_reset(settings: Settings) -> None:
    load_tenant({"slug": "muster-stadtwerke", "name": "Echt"}, [], is_demo=False)

    with pytest.raises(CommandError, match="not a Demo Tenant"):
        call_command("reset_demo", stdout=StringIO())


def test_on_an_empty_database_the_reset_loads_the_demo(reset: Callable[[], None]) -> None:
    reset()

    assert tenant_id_for("muster-stadtwerke") is not None
