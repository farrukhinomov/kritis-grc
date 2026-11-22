import json
from collections.abc import Callable
from datetime import timedelta
from http import HTTPStatus
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.test import Client
from django.utils import timezone
from pytest_django.fixtures import Settings

from grc.core.tenancy import tenant_context
from grc.organization.models import ApiToken, Membership, Tenant

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


def _create(client: Client, scope: str = "read_write", **extra: Any) -> Any:
    return client.post(
        f"{TENANT}/api-tokens",
        {"name": "CI", "scope": scope, **extra},
        content_type="application/json",
    )


def _bearer(token: str, **kwargs: Any) -> Client:
    return Client(HTTP_AUTHORIZATION=f"Bearer {token}", **kwargs)


def _patch_first(client: Client) -> Any:
    item = client.get(f"{TENANT}/implementations").json()["items"][0]
    return client.patch(
        f"{TENANT}/implementations/{item['id']}",
        json.dumps({"note_de": "Per API Token."}),
        content_type="application/json",
        headers={"If-Match": f'"{item["version"]}"'},
    )


def test_the_full_token_is_shown_once_and_only_its_prefix_after(
    login: Callable[[str], Client],
) -> None:
    manager = login("grc_manager")

    created = _create(manager).json()
    listed = manager.get(f"{TENANT}/api-tokens").json()["items"]

    assert created["token"].startswith(f"grc_{created['prefix']}_")
    assert [t["prefix"] for t in listed] == [created["prefix"]]
    assert "token" not in listed[0]
    assert ApiToken._base_manager.get().token_hash != created["token"]


def test_a_read_write_token_reads_and_writes_without_csrf(login: Callable[[str], Client]) -> None:
    token = _create(login("grc_manager")).json()["token"]
    program = _bearer(token, enforce_csrf_checks=True)

    assert program.get(f"{TENANT}/frameworks").status_code == HTTPStatus.OK
    assert _patch_first(program).status_code == HTTPStatus.OK


def test_a_read_only_token_cant_change_anything(login: Callable[[str], Client]) -> None:
    token = _create(login("grc_manager"), scope="read").json()["token"]

    response = _patch_first(_bearer(token))

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["code"] == "read_only_token"


def test_an_auditor_can_only_get_a_read_only_token(login: Callable[[str], Client]) -> None:
    auditor = login("auditor")

    refused = _create(auditor, scope="read_write")
    allowed = _create(auditor, scope="read")

    assert refused.json()["errors"] == [{"field": "scope", "code": "invalid_choice"}]
    assert allowed.status_code == HTTPStatus.CREATED


def test_a_token_works_only_in_its_own_tenant(login: Callable[[str], Client]) -> None:
    token = _create(login("grc_manager")).json()["token"]
    other = Tenant.objects.create(slug="other", name="Other")
    with tenant_context(other.id):
        user = Membership._base_manager.filter(user__email="alex.kramer@example.com").get().user
        Membership.objects.create(tenant=other, user=user, role="grc_manager")

    response = _bearer(token).get("/api/v1/tenants/other/frameworks")

    assert response.status_code == HTTPStatus.NOT_FOUND


@pytest.mark.parametrize(
    "spoil",
    [
        lambda t: t[:-1] + ("A" if t[-1] != "A" else "B"),
        lambda t: "grc_000000000000_" + t.split("_", 2)[2],
        lambda t: "not-a-token",
    ],
)
def test_a_wrong_token_is_401_with_a_bearer_challenge(
    login: Callable[[str], Client], spoil: Callable[[str], str]
) -> None:
    token = _create(login("grc_manager")).json()["token"]

    response = _bearer(spoil(token)).get(f"{TENANT}/frameworks")

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response["WWW-Authenticate"].startswith("Bearer")


def test_expired_and_revoked_tokens_stop_working(login: Callable[[str], Client]) -> None:
    manager = login("grc_manager")
    expiring = _create(manager, expires_in_days=1).json()
    revoked = _create(manager).json()
    ApiToken._base_manager.filter(id=expiring["id"]).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )

    gone = manager.delete(f"{TENANT}/api-tokens/{revoked['id']}")
    again = manager.delete(f"{TENANT}/api-tokens/{revoked['id']}")

    assert gone.status_code == HTTPStatus.NO_CONTENT
    assert again.status_code == HTTPStatus.NOT_FOUND
    for token in (expiring["token"], revoked["token"]):
        assert _bearer(token).get(f"{TENANT}/frameworks").status_code == 401


def test_losing_the_membership_ends_its_tokens(login: Callable[[str], Client]) -> None:
    token = _create(login("grc_manager")).json()["token"]
    Membership._base_manager.filter(user__email="alex.kramer@example.com").delete()

    assert _bearer(token).get(f"{TENANT}/frameworks").status_code == 401


def test_token_lifetime_is_bounded(login: Callable[[str], Client]) -> None:
    response = _create(login("grc_manager"), expires_in_days=400)

    assert response.json()["errors"] == [{"field": "expires_in_days", "code": "max_value"}]


def test_tokens_are_found_under_row_level_security(
    login: Callable[[str], Client], as_application_role: Callable[[], None]
) -> None:
    token = _create(login("grc_manager")).json()["token"]
    as_application_role()

    assert _bearer(token).get(f"{TENANT}/frameworks").status_code == HTTPStatus.OK
