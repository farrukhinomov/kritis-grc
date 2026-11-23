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

from grc.core.actor import Actor
from grc.core.tenancy import tenant_context
from grc.organization.models import (
    Membership,
    MembershipScope,
    Role,
    Scope,
    Tenant,
    TokenScope,
    User,
)
from grc.organization.services.tokens import issue

pytestmark = pytest.mark.django_db

OTHER_SCOPE = UUID("00000000-0000-4000-8000-000000000001")

SESSION_ACTORS = ("anonymous", "auditor", "manager", "scoped_manager", "outsider")
# API Tokens of the GRC Manager's Membership: one read-only, one read-write.
TOKEN_ACTORS = ("read_token", "write_token")
ACTORS = SESSION_ACTORS + TOKEN_ACTORS

OK, CREATED, NO_CONTENT = HTTPStatus.OK, HTTPStatus.CREATED, HTTPStatus.NO_CONTENT
UNAUTHENTICATED, FORBIDDEN, NOT_FOUND = (
    HTTPStatus.UNAUTHORIZED,
    HTTPStatus.FORBIDDEN,
    HTTPStatus.NOT_FOUND,
)
INVALID, BAD_REQUEST = HTTPStatus.UNPROCESSABLE_ENTITY, HTTPStatus.BAD_REQUEST


def _row(anonymous: int, auditor: int, manager: int, scoped: int, outsider: int) -> dict[str, int]:
    return dict(zip(SESSION_ACTORS, (anonymous, auditor, manager, scoped, outsider), strict=True))


def _with_tokens(method: str, template: str, row: dict[str, int]) -> dict[str, int]:
    """Tokens act as their Membership, except that a read-only one can't change anything
    in a Tenant, and no token may manage tokens."""
    if "/api-tokens" in template:
        return {**row, "read_token": FORBIDDEN, "write_token": FORBIDDEN}
    in_tenant = "/tenants/" in template
    read = row["manager"] if method == "GET" or not in_tenant else FORBIDDEN
    return {**row, "read_token": read, "write_token": row["manager"]}


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
    ("GET", "/api/v1/tenants/{tenant_slug}/deadlines"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/frameworks"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/requirements"): (None, READ),
    # The catalogue is empty in this test, so a member gets 404 and so does the outsider.
    ("GET", "/api/v1/tenants/{tenant_slug}/requirements/{requirement_id}"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/mappings"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/implementations"): (None, READ),
    # No Implementation exists here: members get 404, and the role check comes first.
    ("GET", "/api/v1/tenants/{tenant_slug}/implementations/{implementation_id}"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("PATCH", "/api/v1/tenants/{tenant_slug}/implementations/{implementation_id}"): (
        {"status": "implemented"},
        _row(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/implementations/{implementation_id}/evidence"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("POST", "/api/v1/tenants/{tenant_slug}/implementations/{implementation_id}/evidence"): (
        {"kind": "link", "title": "Policy", "url": "https://example.org"},
        _row(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    (
        "DELETE",
        "/api/v1/tenants/{tenant_slug}/implementations/{implementation_id}/evidence/{evidence_id}",
    ): (None, _row(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, NOT_FOUND, NOT_FOUND)),
    ("POST", "/api/v1/tenants/{tenant_slug}/uploads"): (
        {"name": "a.pdf", "size_bytes": 10, "content_type": "application/pdf"},
        _row(UNAUTHENTICATED, FORBIDDEN, CREATED, CREATED, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/compliance-summary"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/activity"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/assets"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/hazards"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/risks"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/risk-matrix"): (None, READ),
    ("GET", "/api/v1/tenants/{tenant_slug}/risk-assessments"): (None, READ),
    # Readable by every member; what it lists depends on who may approve.
    ("GET", "/api/v1/tenants/{tenant_slug}/approvals"): (None, READ),
    # No assessment exists here: deciding needs approval rights, then finds nothing.
    ("POST", "/api/v1/tenants/{tenant_slug}/risk-assessments/{assessment_id}/approve"): (
        {},
        _row(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("POST", "/api/v1/tenants/{tenant_slug}/risk-assessments/{assessment_id}/reject"): (
        {"note_de": "Unvollständig."},
        _row(UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    # No Risk exists here: members get 404 after the role check.
    ("GET", "/api/v1/tenants/{tenant_slug}/risks/{risk_id}"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    ("GET", "/api/v1/tenants/{tenant_slug}/api-tokens"): (None, READ),
    # Every member may hold a read-only token, so the Auditor may create this one.
    ("POST", "/api/v1/tenants/{tenant_slug}/api-tokens"): (
        {"name": "ci", "scope": "read"},
        _row(UNAUTHENTICATED, CREATED, CREATED, CREATED, NOT_FOUND),
    ),
    ("DELETE", "/api/v1/tenants/{tenant_slug}/api-tokens/{token_id}"): (
        None,
        _row(UNAUTHENTICATED, NOT_FOUND, NOT_FOUND, NOT_FOUND, NOT_FOUND),
    ),
    # Without its required filters: answered after the membership check.
    ("GET", "/api/v1/tenants/{tenant_slug}/compliance-paragraphs"): (
        None,
        _row(UNAUTHENTICATED, BAD_REQUEST, BAD_REQUEST, BAD_REQUEST, NOT_FOUND),
    ),
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

    with tenant_context(north.id):
        manager = Actor(
            users["manager"].pk,
            Membership.objects.get(user=users["manager"]).id,
            north.id,
            "grc_manager",
        )
        secrets = {
            "read_token": issue(manager, "read", TokenScope.READ, 30)[1],
            "write_token": issue(manager, "write", TokenScope.READ_WRITE, 30)[1],
        }

    def client_for(name: str) -> Callable[[], Client]:
        def make() -> Client:
            if name in secrets:
                return Client(HTTP_AUTHORIZATION=f"Bearer {secrets[name]}")
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
    body, session_row = EXPECTED[(method, template)]
    expected = _with_tokens(method, template, session_row)
    path = (
        template.replace("{tenant_slug}", "north")
        .replace("{requirement_id}", "req-x")
        .replace("{scope_id}", str(OTHER_SCOPE))
        .replace("{implementation_id}", str(OTHER_SCOPE))
        .replace("{evidence_id}", str(OTHER_SCOPE))
        .replace("{token_id}", str(OTHER_SCOPE))
        .replace("{risk_id}", str(OTHER_SCOPE))
        .replace("{assessment_id}", str(OTHER_SCOPE))
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
