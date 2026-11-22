from collections.abc import Callable
from http import HTTPStatus
from uuid import uuid4

import pytest
from django.test import Client

from grc.core.actor import Actor, Permission
from grc.core.tenancy import tenant_context
from grc.organization.models import Membership, Role, Tenant, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def manager() -> User:
    north = Tenant.objects.create(slug="north", name="North", sector="water")
    south = Tenant.objects.create(slug="south", name="South")
    user = User.objects.create_user("lea@example.org", display_name="Lea", job_title="CISO")
    with tenant_context(north.id):
        Membership.objects.create(tenant=north, user=user, role=Role.GRC_MANAGER)
        for n in range(3):
            colleague = User.objects.create_user(f"c{n}@example.org", display_name=f"C{n}")
            Membership.objects.create(tenant=north, user=colleague, role=Role.AUDITOR)
    with tenant_context(south.id):
        stranger = User.objects.create_user("s@example.org", display_name="Stranger")
        Membership.objects.create(tenant=south, user=stranger, role=Role.AUDITOR)
    return user


@pytest.fixture
def client(manager: User) -> Client:
    client = Client()
    client.force_login(manager)
    return client


def test_works_as_the_application_role_under_row_level_security(
    client: Client, as_application_role: Callable[[], None]
) -> None:
    as_application_role()

    response = client.get("/api/v1/tenants/north/members")

    assert response.status_code == HTTPStatus.OK
    names = [m["display_name"] for m in response.json()["items"]]
    assert names == ["C0", "C1", "C2", "Lea"]


def test_members_are_paged(client: Client) -> None:
    response = client.get("/api/v1/tenants/north/members?limit=2&page=2")

    body = response.json()
    assert body["page"] == {"number": 2, "limit": 2, "total": 4}
    assert [m["display_name"] for m in body["items"]] == ["C2", "Lea"]
    assert body["items"][1] == {
        "id": body["items"][1]["id"],
        "display_name": "Lea",
        "email": "lea@example.org",
        "role": "grc_manager",
        "job_title": "CISO",
    }


@pytest.mark.parametrize("query", ["page=0", "limit=abc", "page=-1"])
def test_bad_paging_is_refused(client: Client, query: str) -> None:
    response = client.get(f"/api/v1/tenants/north/members?{query}")

    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert response.json()["code"] == "invalid_pagination"


def test_the_page_size_is_capped(client: Client) -> None:
    response = client.get("/api/v1/tenants/north/members?limit=1000")

    assert response.json()["page"]["limit"] == 100


def test_the_tenant_is_described(client: Client) -> None:
    response = client.get("/api/v1/tenants/north")

    assert response.json() == {
        "slug": "north",
        "name": "North",
        "theme": "saar-green",
        "sector": "water",
    }


def test_the_theme_changes_for_the_tenant(client: Client) -> None:
    response = client.patch(
        "/api/v1/tenants/north", {"theme": "high-contrast"}, content_type="application/json"
    )

    assert response.json()["theme"] == "high-contrast"
    assert Tenant.objects.get(slug="north").theme == "high-contrast"
    assert client.get("/api/v1/me").json()["memberships"][0]["tenant"]["theme"] == "high-contrast"


def test_an_unknown_theme_is_refused(client: Client) -> None:
    response = client.patch(
        "/api/v1/tenants/north", {"theme": "pink"}, content_type="application/json"
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["errors"] == [{"field": "theme", "code": "invalid_choice"}]


def test_an_unknown_tenant_looks_like_one_without_membership(client: Client) -> None:
    assert client.get("/api/v1/tenants/nowhere").status_code == HTTPStatus.NOT_FOUND
    assert client.get("/api/v1/tenants/south").status_code == HTTPStatus.NOT_FOUND


def test_a_deactivated_user_loses_access(client: Client, manager: User) -> None:
    manager.is_active = False
    manager.save()

    assert client.get("/api/v1/tenants/north").status_code in {
        HTTPStatus.UNAUTHORIZED,
        HTTPStatus.NOT_FOUND,
    }


def test_scope_limits_and_permissions_of_an_actor() -> None:
    plant = uuid4()
    scoped = Actor(1, uuid4(), uuid4(), "auditor", frozenset({plant}))
    whole = Actor(1, uuid4(), uuid4(), "grc_manager")

    assert (scoped.sees_scope(plant), scoped.sees_scope(uuid4()), whole.sees_scope(uuid4())) == (
        True,
        False,
        True,
    )
    assert (scoped.can(Permission.CHANGE), whole.can(Permission.APPROVE)) == (False, True)
    assert not Actor(1, uuid4(), uuid4(), "unknown").can(Permission.VIEW)
