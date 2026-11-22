"""Read access to Tenants, Memberships and the signed-in session."""

from typing import TypedDict

from grc.core.tenancy import tenant_context, user_context
from grc.organization.models import Membership, Role, Tenant, User


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
