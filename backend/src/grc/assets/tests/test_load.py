from uuid import UUID, uuid4

import pytest

from grc.assets.models import AssetDependency
from grc.assets.selectors import assets, present_asset
from grc.assets.services import load_assets
from grc.core.actor import Actor
from grc.core.tenancy import tenant_context
from grc.organization.services import load_scopes, load_tenant

pytestmark = pytest.mark.django_db


def _tenant_with_scopes() -> tuple[UUID, dict[str, UUID]]:
    tenant, _ = load_tenant({"slug": "north", "name": "North"}, [])
    scopes = {"site": uuid4(), "org": uuid4()}
    with tenant_context(tenant.id):
        load_scopes([{"id": key, "name": key, "kind": "organization"} for key in scopes], scopes)
    return tenant.id, scopes


def _asset(fixture_id: str, scope: str, depends_on: list[str]) -> dict[str, object]:
    return {
        "id": fixture_id,
        "scope_id": scope,
        "name": fixture_id,
        "kind": "building",
        "criticality": "low",
        "depends_on": depends_on,
    }


def test_reloading_replaces_the_dependencies_instead_of_adding_to_them() -> None:
    tenant_id, scopes = _tenant_with_scopes()
    ids = {"plant": uuid4(), "grid": uuid4(), "dc": uuid4()}
    shared = [_asset("grid", "org", []), _asset("dc", "org", [])]
    with tenant_context(tenant_id):
        load_assets([_asset("plant", "site", ["grid"]), *shared], ids, scopes)
        load_assets([_asset("plant", "site", ["dc"]), *shared], ids, scopes)

        needed = AssetDependency.objects.filter(asset_id=ids["plant"])
        assert [d.depends_on_id for d in needed] == [ids["dc"]]


def test_a_scope_limited_actor_sees_only_its_scopes_assets() -> None:
    tenant_id, scopes = _tenant_with_scopes()
    ids = {"plant": uuid4(), "grid": uuid4()}
    actor = Actor(1, uuid4(), tenant_id, "grc_manager", scope_ids=frozenset({scopes["site"]}))
    with tenant_context(tenant_id):
        load_assets([_asset("plant", "site", ["grid"]), _asset("grid", "org", [])], ids, scopes)

        visible = [present_asset(a) for a in assets(actor)]

    assert [a["id"] for a in visible] == [str(ids["plant"])]
    # The dependency on the shared Asset stays visible as a reference.
    assert visible[0]["depends_on"] == [str(ids["grid"])]
