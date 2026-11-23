"""Search behind the command palette, inside one Tenant and the actor's Scopes."""

from io import StringIO
from typing import Any
from uuid import uuid4

import pytest
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.assets.selectors import search_assets
from grc.compliance.selectors.implementations import search_requirements
from grc.core.actor import Actor
from grc.core.ids import fixture_uuid
from grc.core.tenancy import tenant_context
from grc.core.text import compact, fold
from grc.organization.selectors import tenant_id_for
from grc.risk.selectors import search_risks

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _uuid(fixture_id: str) -> str:
    return str(fixture_uuid("muster-stadtwerke", fixture_id))


@pytest.fixture
def client(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "auditor"}, content_type="application/json")
    return client


def _search(client: Client, q: str) -> Any:
    response = client.get(f"{TENANT}/search", {"q": q})
    assert response.status_code == 200, response.content
    return response.json()


def test_folding_ignores_case_and_accents_and_compacting_ignores_spaces_and_dots() -> None:
    assert fold("Gefährdung ÜBER") == "gefahrdung uber"
    assert compact("§ 13 Abs. 3") == compact("§13 abs.3")


def test_a_citation_finds_its_requirement_first_with_where_to_open_it(client: Client) -> None:
    hits = _search(client, "§13 abs.3 nr.2")["requirements"]

    first = hits["items"][0]
    assert first["id"] == "req-k-13-3-2"
    assert first["framework_name"] == "KRITIS-Dachgesetz"
    # The cockpit opens a Requirement where a Critical Facility applies it.
    assert first["scope_id"] in {_uuid("sc-nord"), _uuid("sc-sued")}


def test_titles_rank_before_statute_text(client: Client) -> None:
    hits = _search(client, "resilienzplan")["requirements"]["items"]

    assert hits[0]["title_de"] == "Resilienzplan"


def test_risks_and_assets_are_found_without_accents(client: Client) -> None:
    results = _search(client, "stromausfall")
    assets = _search(client, "brunnenfeld")["assets"]

    assert results["risks"]["total"] >= 1
    assert all("Stromausfall" in r["title_de"] for r in results["risks"]["items"])
    assert results["risks"]["items"][0]["scope_name"]
    assert {a["name"] for a in assets["items"]} >= {"Brunnenfeld Nord"}
    assert _search(client, "BRÜNNENFELD")["assets"]["total"] == assets["total"]


def test_each_group_shows_at_most_five_and_says_how_many_matched(client: Client) -> None:
    hits = _search(client, "die")["requirements"]

    assert len(hits["items"]) <= 5
    assert hits["total"] > len(hits["items"])


def test_a_query_too_short_is_refused(client: Client) -> None:
    response = client.get(f"{TENANT}/search", {"q": " a "})

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_filter"


def test_a_scope_limited_membership_finds_only_its_scopes_work(client: Client) -> None:
    tenant_id = tenant_id_for("muster-stadtwerke")
    assert tenant_id is not None
    north = fixture_uuid("muster-stadtwerke", "sc-nord")
    actor = Actor(1, uuid4(), tenant_id, "grc_manager", scope_ids=frozenset({north}))

    with tenant_context(tenant_id):
        risks, _ = search_risks(actor, "wasserwerk", limit=50)
        risks += search_risks(actor, "nord", limit=50)[0] + search_risks(actor, "süd", limit=50)[0]
        assets, _ = search_assets(actor, "brunnenfeld", limit=50)
        requirements, _ = search_requirements(actor, "13", limit=50)

    assert all(r["scope_name"] == "Wasserwerk Nord" for r in risks)
    assert [a["name"] for a in assets] == ["Brunnenfeld Nord"]
    assert {r["scope_id"] for r in requirements} == {str(north)}
