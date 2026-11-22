"""Read access to Tenants, Memberships and the signed-in session."""

from typing import Any, TypedDict

from django.contrib.auth.models import AnonymousUser
from django.db.models import QuerySet

from grc.core.actor import Actor
from grc.core.tenancy import tenant_context, user_context
from grc.organization.models import (
    Membership,
    MembershipScope,
    RegistrationStatus,
    Role,
    Scope,
    ScopeKind,
    Tenant,
    User,
)
from grc.organization.selectors.legal import deadlines_for


class TenantSummary(TypedDict):
    slug: str
    name: str
    theme: str


class MembershipSummary(TypedDict):
    tenant: TenantSummary
    role: str


class UserSummary(TypedDict):
    id: str
    display_name: str
    email: str


class Session(TypedDict):
    user: UserSummary
    memberships: list[MembershipSummary]


def session_of(user: User) -> Session:
    """The signed-in user and every Tenant they may open, with their role in each."""
    # No Tenant is chosen yet, so the database shows the rows by their owner instead.
    with user_context(user.pk):
        memberships = list(
            Membership.objects.filter(user=user)
            .select_related("tenant")
            .order_by("-tenant__is_demo", "tenant__name")
        )
    return {
        "user": {
            "id": str(user.pk),
            "display_name": user.display_name or user.email,
            "email": user.email,
        },
        "memberships": [
            {
                "tenant": {
                    "slug": m.tenant.slug,
                    "name": m.tenant.name,
                    "theme": m.tenant.theme,
                },
                "role": m.role,
            }
            for m in memberships
        ],
    }


def demo_account(role: Role) -> User | None:
    """The shared Demo Tenant account that the demo login for `role` signs in as."""
    tenant = Tenant.objects.filter(is_demo=True).order_by("slug").first()
    if tenant is None:
        return None
    with tenant_context(tenant.id):
        membership = (
            Membership.objects.filter(
                tenant=tenant, role=role, user__is_demo_account=True, user__is_active=True
            )
            .select_related("user")
            .order_by("user__email")
            .first()
        )
    return membership.user if membership else None


def resolve_actor(user: User | AnonymousUser, tenant_slug: str) -> Actor | None:
    """The caller's Membership in the Tenant named by the URL, or None if they have none."""
    if not isinstance(user, User) or not user.is_active:
        return None
    tenant = Tenant.objects.filter(slug=tenant_slug).first()
    if tenant is None:
        return None
    with tenant_context(tenant.id), user_context(user.pk):
        membership = Membership.objects.filter(tenant=tenant, user=user).first()
        if membership is None:
            return None
        scope_ids = frozenset(
            MembershipScope.objects.filter(membership=membership).values_list("scope_id", flat=True)
        )
    return Actor(
        user_id=user.pk,
        membership_id=membership.id,
        tenant_id=tenant.id,
        role=membership.role,
        scope_ids=scope_ids or None,
    )


def tenant_of(actor: Actor) -> Tenant:
    return Tenant.objects.get(id=actor.tenant_id)


def present_tenant(tenant: Tenant) -> dict[str, Any]:
    return {
        "slug": tenant.slug,
        "name": tenant.name,
        "theme": tenant.theme,
        "sector": tenant.sector,
    }


def members_of(actor: Actor) -> QuerySet[Membership]:
    return (
        Membership.objects.filter(tenant_id=actor.tenant_id)
        .select_related("user")
        .order_by("user__display_name", "user__email")
    )


def present_member(membership: Membership) -> dict[str, Any]:
    user = membership.user
    return {
        "id": str(user.pk),
        "display_name": user.display_name or user.email,
        "email": user.email,
        "role": membership.role,
        "job_title": user.job_title,
    }


def scopes(actor: Actor, *, kind: str | None = None) -> QuerySet[Scope]:
    """The Scopes the actor may see: all of the Tenant's, or only those of their Membership."""
    items = Scope.objects.order_by("kind", "name")
    if actor.scope_ids is not None:
        items = items.filter(id__in=actor.scope_ids)
    if kind is not None:
        items = items.filter(kind=kind)
    return items


def present_scope(scope: Scope) -> dict[str, Any]:
    facility = None
    if scope.kind == ScopeKind.CRITICAL_FACILITY and scope.registration_date is not None:
        confirmed = scope.registration_status == RegistrationStatus.CONFIRMED
        facility = {
            "sector": scope.sector,
            "critical_service": scope.critical_service,
            "people_supplied": scope.people_supplied,
            "threshold": scope.threshold,
            "location": scope.location,
            "registration": {
                "status": scope.registration_status,
                "date": scope.registration_date.isoformat(),
            },
            "deadlines": deadlines_for(scope.registration_date, confirmed, scope.sector),
        }
    return {
        "id": str(scope.id),
        "name": scope.name,
        "kind": scope.kind,
        "critical_facility": facility,
    }


def is_member(actor: Actor, user_id: int) -> bool:
    """Whether a user belongs to the actor's Tenant, e.g. to be made an owner."""
    return Membership.objects.filter(tenant_id=actor.tenant_id, user_id=user_id).exists()
