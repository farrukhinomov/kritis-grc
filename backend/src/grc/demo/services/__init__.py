"""Restores the Demo Tenant from the shared fixtures.

The fixtures are the same files the prototype's mock API serves, so the real demo and
the prototype show the same company. Loading is idempotent and keeps every identifier,
so it can run again at any time, such as every night.
"""

import json
from pathlib import Path
from typing import Any

from django.db import transaction

from grc.assets import services as assets
from grc.assets.services import load_assets
from grc.compliance import services as compliance
from grc.compliance.services.evidence import load_evidence
from grc.compliance.services.implementations import load_implementations
from grc.compliance.services.suggestions import load_mapping_suggestions
from grc.core.ids import fixture_uuid
from grc.core.outbox import services as outbox
from grc.core.purge import activity_purge
from grc.core.storage import storage
from grc.core.tenancy import tenant_context
from grc.organization import services as organization
from grc.organization.selectors import is_demo_tenant, tenant_id_for
from grc.risk import services as risk
from grc.risk.services import load_hazards, load_risks
from grc.risk.services.assessments import load_risk_assessments

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
            suggested = read("mapping-suggestions")
            load_mapping_suggestions(suggested, _ids(tenant.slug, suggested), users)
            assets = read("assets")
            asset_ids = _ids(tenant.slug, assets)
            load_assets(assets, asset_ids, scope_ids)
            hazards = read("hazards")
            hazard_ids = _ids(tenant.slug, hazards)
            load_hazards(hazards, hazard_ids)
            risks = read("risks")
            risk_ids = _ids(tenant.slug, risks)
            load_risks(
                risks,
                risk_ids,
                scope_ids=scope_ids,
                hazard_ids=hazard_ids,
                asset_ids=asset_ids,
                implementation_ids=implementation_ids,
                user_ids=users,
            )
            assessments = read("risk-assessments")
            load_risk_assessments(
                assessments,
                _ids(tenant.slug, assessments),
                scope_ids=scope_ids,
                risk_ids=risk_ids,
                user_ids=users,
            )


def _ids(tenant_slug: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {row["id"]: fixture_uuid(tenant_slug, row["id"]) for row in rows}


class NotDemoTenantError(RuntimeError):
    """Only a Demo Tenant may be reset; any other Tenant's data is real."""


def reset_demo(seed_dir: Path) -> None:
    """Puts the Demo Tenant back to its fixtures, as if no visitor had touched it.

    Everything happens in one transaction: the Tenant's rows and their Activity Log go,
    the fixtures load again, and only after the commit do the stored files go too, so a
    failed reset leaves yesterday's demo intact. Visitors' sessions end with it.
    """
    tenant = json.loads((seed_dir / "tenant.json").read_text(encoding="utf-8"))
    tenant_id = tenant_id_for(tenant["slug"])
    if tenant_id is not None and not is_demo_tenant(tenant_id):
        raise NotDemoTenantError(f"{tenant['slug']} is not a Demo Tenant.")
    with transaction.atomic():
        if tenant_id is not None:
            with tenant_context(tenant_id), activity_purge():
                # Children before parents: each module's rows may point at the next.
                outbox.purge_tenant_data()
                risk.purge_tenant_data()
                assets.purge_tenant_data()
                compliance.purge_tenant_data()
                organization.purge_tenant_data()
            prefix = f"tenants/{tenant_id}/"
            transaction.on_commit(lambda: storage().delete_prefix(prefix), robust=True)
        load_demo(seed_dir)
    organization.end_demo_sessions()
