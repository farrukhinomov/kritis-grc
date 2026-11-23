"""Reading Assets, narrowed to the Scopes the actor may see."""

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from django.db.models import Prefetch, QuerySet

from grc.assets.models import Asset, AssetDependency
from grc.assets.selectors.graph import reachable, roots
from grc.core.actor import Actor
from grc.core.ids import uuid_or_none
from grc.organization.selectors import scopes


def assets(actor: Actor, *, scope: str | None = None) -> QuerySet[Asset]:
    items = Asset.objects.prefetch_related(
        Prefetch("dependencies", queryset=AssetDependency.objects.order_by("depends_on__name"))
    ).order_by("name", "id")
    if actor.scope_ids is not None:
        items = items.filter(scope_id__in=actor.scope_ids)
    if scope is not None:
        items = items.filter(scope_id=uuid_or_none(scope))
    return items


def assets_by_id(actor: Actor, ids: list[UUID]) -> dict[UUID, Asset]:
    """The visible Assets among `ids`, for other modules that name them."""
    return {asset.id: asset for asset in assets(actor).filter(id__in=ids)}


def present_asset(asset: Asset) -> dict[str, Any]:
    return {
        "id": str(asset.id),
        "scope_id": str(asset.scope_id),
        "name": asset.name,
        "kind": asset.kind,
        "criticality": asset.criticality,
        "depends_on": [str(d.depends_on_id) for d in asset.dependencies.all()],
        "description": asset.description,
    }


def search_assets(actor: Actor, query: str, *, limit: int) -> tuple[list[dict[str, Any]], int]:
    """The actor's Assets whose name holds the query, ignoring case and accents."""
    found = (
        Asset.objects.filter(name__unaccent__icontains=query)
        .filter(**({} if actor.scope_ids is None else {"scope_id__in": actor.scope_ids}))
        .order_by("name", "id")
    )
    return [
        {"id": str(asset_id), "name": name, "scope_id": str(scope_id), "scope_name": scope_name}
        for asset_id, name, scope_id, scope_name in found.values_list(
            "id", "name", "scope_id", "scope__name"
        )[:limit]
    ], found.count()


def dependency_graph(
    actor: Actor, scope_id: UUID, threats: Mapping[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """A Critical Facility's Assets and, across Scopes, everything they depend on.

    Only what the actor may see: for a Scope-limited Membership, a dependency in a Scope
    outside it is left out with its edge rather than shown. Each Asset carries the
    facility's own threat to it (`threats`); an Asset two facilities share is threatened
    differently in each. None when the Scope is no visible Critical Facility.
    """
    facility = scopes(actor, kind="critical_facility").filter(id=scope_id).first()
    if facility is None:
        return None
    visible = {str(asset.id): asset for asset in assets(actor).select_related("scope")}
    needs = {
        asset_id: [str(d.depends_on_id) for d in asset.dependencies.all()]
        for asset_id, asset in visible.items()
    }
    own = [asset_id for asset_id, asset in visible.items() if asset.scope_id == scope_id]
    in_graph = reachable(own, needs)
    members = set(in_graph)
    nodes = []
    for asset_id in in_graph:
        asset = visible[asset_id]
        nodes.append(
            {
                **present_asset(asset),
                # Only edges whose both ends are in the graph.
                "depends_on": [d for d in needs[asset_id] if d in members],
                "scope_name": asset.scope.name,
                "risks": threats.get(asset_id, {"count": 0, "highest": None}),
            }
        )
    return {
        "scope": {"id": str(facility.id), "name": facility.name},
        "roots": roots(own, needs),
        "assets": nodes,
    }
