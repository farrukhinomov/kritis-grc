"""Tenant isolation holds in the ORM and, independently, in the database."""

from collections.abc import Callable

import pytest
from django.db import IntegrityError, ProgrammingError, connection

from grc.core.models import TenantMismatchError
from grc.core.tenancy import TenantContextMissingError, tenant_context, user_context
from grc.organization.models import Membership, Role, Scope, Tenant, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def tenants() -> tuple[Tenant, Tenant]:
    north = Tenant.objects.create(slug="north", name="North")
    south = Tenant.objects.create(slug="south", name="South")
    with tenant_context(north.id):
        Scope.objects.create(name="North plant")
    with tenant_context(south.id):
        Scope.objects.create(name="South plant")
    return north, south


def _raw_scope_names() -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT name FROM organization_scope ORDER BY name")
        return [row[0] for row in cursor.fetchall()]


def test_the_orm_only_returns_the_active_tenants_rows(tenants: tuple[Tenant, Tenant]) -> None:
    north, _ = tenants

    with tenant_context(north.id):
        assert list(Scope.objects.values_list("name", flat=True)) == ["North plant"]


def test_the_orm_refuses_to_query_without_a_tenant(tenants: tuple[Tenant, Tenant]) -> None:
    with pytest.raises(TenantContextMissingError):
        list(Scope.objects.all())


def test_a_row_of_another_tenant_cant_be_saved(tenants: tuple[Tenant, Tenant]) -> None:
    north, south = tenants

    with tenant_context(north.id):
        scope = Scope(name="Smuggled", tenant=south)
        with pytest.raises(TenantMismatchError):
            scope.save()


def test_raw_sql_still_sees_only_the_active_tenant(
    tenants: tuple[Tenant, Tenant], as_application_role: Callable[[], None]
) -> None:
    north, _ = tenants
    as_application_role()

    with tenant_context(north.id):
        assert _raw_scope_names() == ["North plant"]


def test_raw_sql_sees_nothing_without_a_tenant(
    tenants: tuple[Tenant, Tenant], as_application_role: Callable[[], None]
) -> None:
    as_application_role()

    assert _raw_scope_names() == []


def test_the_database_rejects_writing_into_another_tenant(
    tenants: tuple[Tenant, Tenant], as_application_role: Callable[[], None]
) -> None:
    north, south = tenants
    as_application_role()

    with tenant_context(north.id), connection.cursor() as cursor, pytest.raises(ProgrammingError):
        cursor.execute(
            "INSERT INTO organization_scope (id, name, tenant_id) "
            "VALUES (gen_random_uuid(), 'Smuggled', %s)",
            [south.id],
        )


def test_a_user_sees_their_own_memberships_before_a_tenant_is_chosen(
    tenants: tuple[Tenant, Tenant], as_application_role: Callable[[], None]
) -> None:
    north, south = tenants
    alice = User.objects.create_user("alice@example.org")
    bob = User.objects.create_user("bob@example.org")
    with tenant_context(north.id):
        Membership.objects.create(tenant=north, user=alice, role=Role.AUDITOR)
        Membership.objects.create(tenant=north, user=bob, role=Role.AUDITOR)
    with tenant_context(south.id):
        Membership.objects.create(tenant=south, user=alice, role=Role.GRC_MANAGER)
    as_application_role()

    with user_context(alice.pk):
        mine = set(Membership.objects.values_list("tenant__slug", "user__email"))

    assert mine == {("north", "alice@example.org"), ("south", "alice@example.org")}


def test_a_user_needs_an_email() -> None:
    with pytest.raises(ValueError, match="email"):
        User.objects.create_user("")


def test_one_membership_per_user_and_tenant(tenants: tuple[Tenant, Tenant]) -> None:
    north, _ = tenants
    alice = User.objects.create_user("alice@example.org")
    with tenant_context(north.id):
        Membership.objects.create(tenant=north, user=alice, role=Role.AUDITOR)
        with pytest.raises(IntegrityError):
            Membership.objects.create(tenant=north, user=alice, role=Role.GRC_MANAGER)


def test_a_platform_admin_is_a_staff_superuser() -> None:
    admin = User.objects.create_superuser("ops@example.org", "a-long-enough-password")

    assert (admin.is_staff, admin.is_superuser, str(admin)) == (True, True, "ops@example.org")


def test_names_are_shown_as_text(tenants: tuple[Tenant, Tenant]) -> None:
    north, _ = tenants
    with tenant_context(north.id):
        assert (str(north), str(Scope.objects.get())) == ("North", "North plant")
