"""Signing in and out, and changes to the Tenant itself.

Passwords are verified by allauth, which also rate-limits failed attempts by address and
by IP; this module only decides who may get a session. The demo login is a separate
door: it exists only while switched on, only for the Demo Tenant's shared accounts, and
has its own rate limit because it needs no secret.
"""

from datetime import date
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from allauth.account.adapter import get_adapter
from allauth.core import ratelimit
from django.conf import settings
from django.contrib.auth import login, logout
from django.core.exceptions import ValidationError
from django.http import HttpRequest
from django.utils import timezone
from rest_framework import status

from grc.core.actor import Actor, Permission
from grc.core.problems import FieldProblem, Problem
from grc.core.purge import purge_rows
from grc.core.tenancy import tenant_context
from grc.organization.models import (
    ApiToken,
    IdempotencyRecord,
    Membership,
    MembershipScope,
    RegistrationStatus,
    Role,
    Scope,
    ScopeKind,
    Tenant,
    Theme,
    User,
)
from grc.organization.selectors import Session, demo_account, session_of, tenant_of
from grc.organization.selectors.legal import service_for

AUTH_BACKEND = "allauth.account.auth_backends.AuthenticationBackend"


def password_login(request: HttpRequest, email: str, password: str) -> Session:
    try:
        user = get_adapter(request).authenticate(request, email=email, password=password)
    except ValidationError as error:
        raise _too_many_attempts() from error
    # Demo accounts have no usable password, so this also keeps them out of this door.
    if not isinstance(user, User) or user.is_demo_account:
        # Same answer whether the address exists or not, so accounts can't be probed.
        raise Problem(
            status.HTTP_400_BAD_REQUEST,
            "invalid_credentials",
            "Email or password is not correct.",
        )
    login(request, user, backend=AUTH_BACKEND)
    return session_of(user)


def demo_login(request: HttpRequest, role: Role) -> Session:
    if not settings.DEMO_LOGIN_ENABLED:
        # Answers as if the endpoint did not exist, like every switched-off feature.
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if not ratelimit.consume(request, action="demo_login"):
        raise _too_many_attempts()
    user = demo_account(role)
    if user is None:
        raise Problem(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "service_unavailable",
            "The demo is not set up.",
        )
    login(request, user, backend=AUTH_BACKEND)
    return session_of(user)


def sign_out(request: HttpRequest) -> None:
    logout(request)


def change_theme(actor: Actor, theme: Theme) -> Tenant:
    """The Theme is the Tenant's, so it changes for everyone in it."""
    actor.require(Permission.CHANGE)
    tenant = tenant_of(actor)
    if tenant.theme != theme:
        tenant.theme = theme
        tenant.save(update_fields=["theme"])
    return tenant


def load_tenant(
    tenant: dict[str, Any],
    people: list[dict[str, Any]],
    *,
    is_demo: bool = False,
    demo_accounts: frozenset[str] = frozenset(),
) -> tuple[Tenant, dict[str, int]]:
    """Creates or updates a Tenant and its people; returns it and their IDs by fixture ID.

    Loaded people get no usable password: they sign in through the demo login (the ones
    listed in `demo_accounts`) or not at all, until someone sets a password for them.
    """
    row, _ = Tenant.objects.update_or_create(
        slug=tenant["slug"],
        defaults={
            "name": tenant["name"],
            "theme": tenant.get("theme", Theme.SAAR_GREEN),
            "sector": tenant.get("sector", ""),
            "is_demo": is_demo,
        },
    )
    ids: dict[str, int] = {}
    for person in people:
        user = User.objects.filter(email=person["email"]).first()
        if user is None:
            user = User(email=person["email"])
            user.set_unusable_password()
        user.display_name = person["display_name"]
        user.job_title = person.get("job_title", "")
        user.is_demo_account = person["id"] in demo_accounts
        user.save()
        ids[person["id"]] = user.pk
        with tenant_context(row.id):
            Membership.objects.update_or_create(
                tenant=row, user=user, defaults={"role": person["role"]}
            )
    return row, ids


def create_critical_facility(
    actor: Actor,
    *,
    name: str,
    location: str,
    sector: str,
    critical_service: str,
    people_supplied: int,
    registration_date: date,
) -> Scope:
    """A new Critical Facility, as the Applicability Check found it.

    Only a facility at or above the legal threshold is created, and only with a planned
    Registration: confirming it is the authority's act, and a facility below the
    threshold would carry deadlines it doesn't have. The threshold is the law's, so it
    is set here and never taken from the caller.
    """
    actor.require(Permission.CHANGE)
    service = service_for(sector, critical_service)
    errors: list[dict[str, str]] = []
    if service is None:
        errors.append({"field": "critical_facility.critical_service", "code": "invalid_choice"})
    elif people_supplied < service.threshold:
        errors.append({"field": "critical_facility.people_supplied", "code": "below_threshold"})
    if registration_date < berlin_today():
        errors.append({"field": "critical_facility.registration.date", "code": "in_past"})
    if errors or service is None:
        raise FieldProblem(errors)
    scope: Scope = Scope.objects.create(
        name=name,
        kind=ScopeKind.CRITICAL_FACILITY,
        sector=sector,
        critical_service=critical_service,
        people_supplied=people_supplied,
        threshold=service.threshold,
        location=location,
        registration_status=RegistrationStatus.PLANNED,
        registration_date=registration_date,
    )
    return scope


def berlin_today() -> date:
    # Deadlines are German law; a date counts as past by the calendar in Germany.
    return timezone.now().astimezone(ZoneInfo("Europe/Berlin")).date()


def load_scopes(scopes: list[dict[str, Any]], ids: dict[str, UUID]) -> None:
    """Loads Scopes into the active Tenant under stable identifiers."""
    for scope in scopes:
        facility = scope.get("critical_facility") or {}
        registration = facility.get("registration") or {}
        date_text = registration.get("date")
        Scope.objects.update_or_create(
            id=ids[scope["id"]],
            defaults={
                "name": scope["name"],
                "kind": scope["kind"],
                "sector": facility.get("sector", ""),
                "critical_service": facility.get("critical_service", ""),
                "people_supplied": facility.get("people_supplied"),
                "threshold": facility.get("threshold"),
                "location": facility.get("location", ""),
                "registration_status": registration.get("status", ""),
                "registration_date": date.fromisoformat(date_text) if date_text else None,
            },
        )


def _too_many_attempts() -> Problem:
    return Problem(
        status.HTTP_429_TOO_MANY_REQUESTS,
        "too_many_requests",
        "Too many attempts. Try again later.",
    )


def purge_tenant_data() -> int:
    """Removes the active Tenant's Scopes and their access settings, for the Demo Tenant
    reset. Memberships and people stay: loading the Demo Tenant updates them."""
    return purge_rows([ApiToken, IdempotencyRecord, MembershipScope, Scope])


def end_demo_sessions() -> None:
    """Signs every visitor out of the demo accounts.

    A session stays valid only while its account's password hash is unchanged, so a new
    unusable password ends them all at once, wherever they are stored.
    """
    for user in User.objects.filter(is_demo_account=True):
        user.set_unusable_password()
        user.save(update_fields=["password"])
