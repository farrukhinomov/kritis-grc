"""Stable identifiers for rows loaded from fixtures.

A Tenant's data loaded from the shared fixtures gets the same UUIDs every time it is
loaded, derived from the Tenant and the fixture's own readable ID. Links into the Demo
Tenant therefore keep working after its nightly reset.
"""

from uuid import UUID, uuid5

_NAMESPACE = UUID("6f1c2a4e-3b7d-4e0a-9c55-2d8b1f6a7e30")


def fixture_uuid(tenant_slug: str, fixture_id: str) -> UUID:
    return uuid5(_NAMESPACE, f"{tenant_slug}/{fixture_id}")
