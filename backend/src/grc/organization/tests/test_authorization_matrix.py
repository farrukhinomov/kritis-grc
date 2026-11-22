"""Every API operation against every kind of caller.

The operations come from the OpenAPI schema, so a new endpoint fails this test until its
row is added: nobody can ship an endpoint without deciding who may call it.
"""

import json
from collections.abc import Callable
from http import HTTPStatus
from typing import Any
from uuid import UUID

import pytest
from django.test import Client
from drf_spectacular.generators import SchemaGenerator

from grc.core.tenancy import tenant_context
from grc.organization.models import Membership, MembershipScope, Role, Scope, Tenant, User

pytestmark = pytest.mark.django_db

OTHER_SCOPE = UUID("00000000-0000-4000-8000-000000000001")

ACTORS = ("anonymous", "auditor", "manager", "scoped_manager", "outsider")

OK, CREATED, NO_CONTENT = HTTPStatus.OK, HTTPStatus.CREATED, HTTPStatus.NO_CONTENT
UNAUTHENTICATED, FORBIDDEN, NOT_FOUND = (
    HTTPStatus.UNAUTHORIZED,
    HTTPStatus.FORBIDDEN,
    HTTPStatus.NOT_FOUND,
)
INVALID = HTTPStatus.UNPROCESSABLE_ENTITY


def _row(anonymous: int, auditor: int, manager: int, scoped: int, outsider: int) -> dict[str, int]:
    return dict(zip(ACTORS, (anonymous, auditor, manager, scoped, outsider), strict=True))


READ = _row(UNAUTHENTICATED, OK, OK, OK, NOT_FOUND)
NEW_FACILITY = {
    "name": "Wasserwerk Ost",
    "location": "Musterstadt-Ost",
    "critical_facility": {
        "sector": "water",
        "critical_service": "drinking_water_supply",
        "people_supplied": 600_000,
        "registration": {"status": "planned", "date": "2099-01-01"},
    },
}
CHANGE = _row(UNAUTHENTICATED, FORBIDDEN, OK, OK, NOT_FOUND)

# (method, path template) -> (request body, expected status per actor)
EXPECTED: dict[tuple[str, str], tuple[dict[str, Any] | None, dict[str, int]]] = {
    ("GET", "/api/v1/me"): (None, _row(UNAUTHENTICATED, OK, OK, OK, OK)),
    # An empty body: only that the endpoint answers anyone the same way matters here.
    ("POST", "/api/v1/auth/login"): ({}, _row(INVALID, INVALID, INVALID, INVALID, INVALID)),
    # Switched off unless configured, which tests don't.
    ("POST", "/api/v1/auth/demo-login"): (
        {"role": "auditor"},
        _row(NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("POST", "/api/v1/auth/logout"): (
        None,
        _row(NO_CONTENT, NO_CONTENT, NO_CONTENT, NO_CONTENT, NO_CONTENT),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}"): (None, READ),
    ("PATCH", "/api/v1/tenants/{tenant_slug}"): ({"theme": "blue"}, CHANGE),
    ("GET", "/api/v1/tenants/{tenant_slug}/members"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/scopes"): (None, READ),
    # The scope-limited manager sees only their own plant, and creating stays theirs to do.
    ("POST", "/api/v1/tenants/{tenant_slug}/scopes"): (
        NEW_FACILITY,
        _row(UNAUTHENTICATED, FORBIDDEN, CREATED, CREATED, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/scopes/{scope_id}"): (
        None,
        _row(UNAUTHENTICATED, OK, OK, NOT_FOUND, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/critical-services"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/frameworks"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/requirements"): (None, READ),
    # The catalogue is empty in this test, so a member gets 404 and so does the outsider.
    ("GET", "/api/v1/tenants/{tenant_slug}/requirements/{requirement_id}"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/mappings"): (None, READ),
}


@pytest.fixture
def clients() -> dict[str, Callable[[], Client]]:
    north = Tenant.objects.create(slug="north", name="North")
    south = Tenant.objects.create(slug="south", name="South")
    people = {
        "auditor": (north, Role.AUDITOR),
        "manager": (north, Role.GRC_MANAGER),
        "scoped_manager": (north, Role.GRC_MANAGER),
        "outsider": (south, Role.GRC_MANAGER),
    }
    users: dict[str, User] = {}
    for name, (tenant, role) in people.items():
        user = User.objects.create_user(f"{name}@example.org")
        users[name] = user
        with tenant_context(tenant.id):
            membership = Membership.objects.create(tenant=tenant, user=user, role=role)
            if name == "scoped_manager":
                plant = Scope.objects.create(name="North plant")
                MembershipScope.objects.create(membership=membership, scope=plant)
    with tenant_context(north.id):
        # The Scope every path with {scope_id} names: outside the scope-limited manager's.
        Scope.objects.create(id=OTHER_SCOPE, name="North office")

    def client_for(name: str) -> Callable[[], Client]:
        def make() -> Client:
            client = Client()
            if name in users:
                client.force_login(users[name])
            return client

        return make

    return {name: client_for(name) for name in ACTORS}


def _operations() -> set[tuple[str, str]]:
    schema = SchemaGenerator().get_schema(request=None, public=True)  # type: ignore[no-untyped-call]
    return {
        (method.upper(), path)
        for path, operations in schema["paths"].items()
        for method in operations
    }


def test_every_operation_has_a_row() -> None:
    assert sorted(_operations() - EXPECTED.keys()) == []
    assert sorted(EXPECTED.keys() - _operations()) == []


@pytest.mark.parametrize(("method", "template"), sorted(EXPECTED))
def test_operation_answers_each_actor_as_expected(
    method: str, template: str, clients: dict[str, Callable[[], Client]]
) -> None:
    body, expected = EXPECTED[(method, template)]
    path = (
        template.replace("{tenant_slug}", "north")
        .replace("{requirement_id}", "req-x")
        .replace("{scope_id}", str(OTHER_SCOPE))
    )

    actual = {}
    for actor in ACTORS:
        client = clients[actor]()
        response = client.generic(
            method,
            path,
            data="" if body is None else json.dumps(body),
            content_type="application/json",
        )
        actual[actor] = response.status_code

    assert actual == expected
