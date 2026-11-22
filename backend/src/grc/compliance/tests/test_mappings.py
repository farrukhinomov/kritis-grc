from io import StringIO
from uuid import uuid4

import pytest
from django.core.management import call_command

from grc.compliance.models import TenantMapping
from grc.compliance.selectors import mappings
from grc.core.actor import Actor
from grc.core.tenancy import tenant_context
from grc.organization.services import load_tenant

pytestmark = pytest.mark.django_db


def _tenant(slug: str) -> Actor:
    tenant, people = load_tenant(
        {"slug": slug, "name": slug},
        [{"id": "p", "email": f"p@{slug}.example", "display_name": "P", "role": "auditor"}],
    )
    return Actor(people["p"], uuid4(), tenant.id, "auditor")


def _justifications(actor: Actor) -> list[str]:
    with tenant_context(actor.tenant_id):
        return [m["justification_de"] for m in mappings(actor)]


def test_a_tenant_sees_platform_and_its_own_approved_mappings_only() -> None:
    call_command("seed_demo", stdout=StringIO())
    north, south = _tenant("north"), _tenant("south")
    with tenant_context(north.tenant_id):
        for text, approved in (("Approved for North.", "2026-10-01T00:00:00Z"), ("Draft.", None)):
            TenantMapping.objects.create(
                target_requirement_id="req-k-8-1",
                source_requirement_id="req-b-30-2-1",
                coverage="full",
                justification_de=text,
                approved_at=approved,
            )

    seen_by_north, seen_by_south = _justifications(north), _justifications(south)

    assert "Approved for North." in seen_by_north
    assert "Draft." not in seen_by_north
    assert "Approved for North." not in seen_by_south
    assert len(seen_by_south) == len(seen_by_north) - 1
