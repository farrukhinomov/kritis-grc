"""Restores the Demo Tenant from the shared fixtures.

The fixtures are the same files the prototype's mock API serves, so the real demo and
the prototype show the same company. Loading is idempotent and keeps every identifier,
so it can run again at any time, such as every night.
"""

import json
from pathlib import Path
from typing import Any

from django.db import transaction

from grc.assets.services import load_assets
from grc.compliance import services as compliance
from grc.compliance.services.evidence import load_evidence
from grc.compliance.services.implementations import load_implementations
from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.organization import services as organization
from grc.risk.services import load_hazards

# The people behind the two demo logins, as the prototype's mock API also uses them.
DEMO_ACCOUNTS = frozenset({"u-kramer", "u-wolff"})


def load_demo(seed_dir: Path) -> None:
    def read(name: str) -> Any:
        return json.loads((seed_dir / f"{name}.json").read_text(encoding="utf-8"))

    mappings = read("mappings")
    with transaction.atomic():
        compliance.load_catalogue(
            read("frameworks"),
            read("requirements"),
            [m for m in mappings if m["kind"] == "platform"],
        )
        tenant, users = organization.load_tenant(
            read("tenant"), read("users"), is_demo=True, demo_accounts=DEMO_ACCOUNTS
        )
        own = [m for m in mappings if m["kind"] == "tenant"]
        scopes = read("scopes")
        with tenant_context(tenant.id):
            scope_ids = _ids(tenant.slug, scopes)
            organization.load_scopes(scopes, scope_ids)
            compliance.load_tenant_mappings(own, _ids(tenant.slug, own), users)
            implementations = read("implementations")
            implementation_ids = _ids(tenant.slug, implementations)
            load_implementations(implementations, implementation_ids, scope_ids, users)
            evidence = read("evidence")
            load_evidence(evidence, _ids(tenant.slug, evidence), implementation_ids, users)
            assets = read("assets")
            load_assets(assets, _ids(tenant.slug, assets), scope_ids)
            hazards = read("hazards")
            load_hazards(hazards, _ids(tenant.slug, hazards))


def _ids(tenant_slug: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {row["id"]: fixture_uuid(tenant_slug, row["id"]) for row in rows}
