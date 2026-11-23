from collections.abc import Iterator
from http import HTTPStatus
from typing import Any

import pytest
from django.core.cache import cache
from django.test import Client
from pytest_django.fixtures import Settings as SettingsWrapper

from grc.core.tenancy import tenant_context
from grc.organization.models import Membership, Role, Tenant, User

pytestmark = pytest.mark.django_db

PASSWORD = "a-long-and-unguessable-password"


@pytest.fixture(autouse=True)
def _fresh_rate_limits() -> Iterator[None]:
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def demo(settings: SettingsWrapper) -> Tenant:
    settings.DEMO_LOGIN_ENABLED = True
    tenant = Tenant.objects.create(slug="muster", name="Muster", is_demo=True, theme="blue")
    other = Tenant.objects.create(slug="other", name="Other")
    for role, email in ((Role.GRC_MANAGER, "kramer@demo"), (Role.AUDITOR, "wolff@demo")):
        user = User.objects.create_user(f"{email}.example", is_demo_account=True)
        user.set_unusable_password()
        user.save()
        with tenant_context(tenant.id):
            Membership.objects.create(tenant=tenant, user=user, role=role)
    with tenant_context(other.id):
        Membership.objects.create(
            tenant=other,
            user=User.objects.create_user("outsider@example.org", is_demo_account=True),
            role=Role.GRC_MANAGER,
        )
    return tenant


@pytest.fixture
def member() -> User:
    tenant = Tenant.objects.create(slug="north", name="North")
    user = User.objects.create_user("anna@example.org", PASSWORD, display_name="Anna Berg")
    with tenant_context(tenant.id):
        Membership.objects.create(tenant=tenant, user=user, role=Role.AUDITOR)
    return user


def _post(client: Client, path: str, body: dict[str, Any] | None = None) -> Any:
    # Signing in rotates the CSRF token; like the SPA, send whatever the cookie holds now.
    if "csrftoken" in client.cookies:
        client.defaults["HTTP_X_CSRFTOKEN"] = client.cookies["csrftoken"].value
    return client.post(path, body or {}, content_type="application/json")


def _csrf_client() -> Client:
    """A browser that has the CSRF cookie and sends it back, as the SPA does."""
    client = Client(enforce_csrf_checks=True)
    client.get("/api/v1/me")
    return client


def test_me_without_a_session_is_401_problem_details(client: Client) -> None:
    response = client.get("/api/v1/me")

    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response["Content-Type"] == "application/problem+json"
    assert response.json()["code"] == "not_authenticated"
    assert "csrftoken" in response.cookies


def test_password_login_returns_the_session(member: User) -> None:
    client = _csrf_client()

    response = _post(client, "/api/v1/auth/login", {"email": member.email, "password": PASSWORD})

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        "user": {"id": str(member.pk), "display_name": "Anna Berg", "email": member.email},
        "memberships": [
            {"tenant": {"slug": "north", "name": "North", "theme": "saar-green"}, "role": "auditor"}
        ],
    }
    assert client.get("/api/v1/me").json()["user"]["email"] == member.email


def test_wrong_and_unknown_accounts_get_the_same_answer(member: User) -> None:
    client = _csrf_client()

    wrong = _post(client, "/api/v1/auth/login", {"email": member.email, "password": "nope"})
    unknown = _post(client, "/api/v1/auth/login", {"email": "x@example.org", "password": "nope"})

    assert wrong.status_code == unknown.status_code == HTTPStatus.BAD_REQUEST
    assert wrong.json()["code"] == unknown.json()["code"] == "invalid_credentials"


def test_repeated_wrong_passwords_are_rate_limited(member: User) -> None:
    client = _csrf_client()
    body = {"email": member.email, "password": "nope"}

    statuses = [_post(client, "/api/v1/auth/login", body).status_code for _ in range(6)]

    assert statuses[:5] == [HTTPStatus.BAD_REQUEST] * 5
    assert statuses[5] == HTTPStatus.TOO_MANY_REQUESTS


def test_missing_fields_are_listed_by_name(client: Client) -> None:
    response = _post(client, "/api/v1/auth/login", {"email": ""})

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["errors"] == [
        {"field": "email", "code": "required"},
        {"field": "password", "code": "required"},
    ]


def test_login_without_the_csrf_token_is_refused(member: User) -> None:
    client = Client(enforce_csrf_checks=True)

    response = _post(client, "/api/v1/auth/login", {"email": member.email, "password": PASSWORD})

    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["code"] == "csrf_failed"


def test_demo_login_signs_in_as_the_demo_role(demo: Tenant) -> None:
    client = _csrf_client()

    response = _post(client, "/api/v1/auth/demo-login", {"role": "auditor"})

    assert response.status_code == HTTPStatus.OK
    session = response.json()
    assert session["user"]["email"] == "wolff@demo.example"
    assert session["memberships"] == [
        {"tenant": {"slug": "muster", "name": "Muster", "theme": "blue"}, "role": "auditor"}
    ]


def test_demo_login_rejects_an_unknown_role(demo: Tenant) -> None:
    response = _post(_csrf_client(), "/api/v1/auth/demo-login", {"role": "admin"})

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["errors"] == [{"field": "role", "code": "invalid_choice"}]


def test_demo_login_is_gone_when_switched_off(demo: Tenant, settings: SettingsWrapper) -> None:
    settings.DEMO_LOGIN_ENABLED = False

    response = _post(_csrf_client(), "/api/v1/auth/demo-login", {"role": "auditor"})

    assert response.status_code == HTTPStatus.NOT_FOUND


def test_demo_login_needs_a_demo_tenant(settings: SettingsWrapper) -> None:
    settings.DEMO_LOGIN_ENABLED = True

    response = _post(_csrf_client(), "/api/v1/auth/demo-login", {"role": "auditor"})

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


def test_demo_login_is_rate_limited(demo: Tenant) -> None:
    client = _csrf_client()

    statuses = [
        _post(client, "/api/v1/auth/demo-login", {"role": "auditor"}).status_code for _ in range(21)
    ]

    assert statuses[-1] == HTTPStatus.TOO_MANY_REQUESTS


def test_demo_accounts_cant_use_the_password_login(demo: Tenant) -> None:
    response = _post(
        _csrf_client(), "/api/v1/auth/login", {"email": "wolff@demo.example", "password": ""}
    )

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


def test_logout_ends_the_session(member: User) -> None:
    client = _csrf_client()
    _post(client, "/api/v1/auth/login", {"email": member.email, "password": PASSWORD})

    response = _post(client, "/api/v1/auth/logout")

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert client.get("/api/v1/me").status_code == HTTPStatus.UNAUTHORIZED
