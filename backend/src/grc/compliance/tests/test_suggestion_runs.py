"""Asking the AI for Mapping Suggestions: what is sent, what is kept, what it may cost."""

import json
from io import StringIO
from typing import Any

import pytest
from django.conf import settings as django_settings
from django.core.management import CommandError, call_command
from pytest_django.fixtures import Settings

from grc.compliance.models import MappingSuggestion, ModelCall
from grc.compliance.services.suggestion_runs import suggest_mappings
from grc.compliance.testing import FakeSuggester
from grc.core.tenancy import tenant_context
from grc.organization.selectors import tenant_id_for

pytestmark = pytest.mark.django_db


def _fixture(name: str) -> Any:
    return json.loads((django_settings.SEED_DIR / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def demo() -> Any:
    call_command("seed_demo", stdout=StringIO())
    return tenant_id_for("muster-stadtwerke")


def _open_targets() -> set[str]:
    kritis = {r["id"] for r in _fixture("requirements") if r["id"].startswith("req-k-")}
    settled = {m["target_requirement_id"] for m in _fixture("mappings")} | {
        s["target_requirement_id"] for s in _fixture("mapping-suggestions")
    }
    return kritis - settled


def test_only_targets_without_mapping_or_suggestion_are_asked_once_each(
    demo: Any, ai_service: FakeSuggester
) -> None:
    summary = suggest_mappings(demo)

    assert {r["target"]["id"] for r in ai_service.requests} == _open_targets()
    assert (summary.asked, summary.created, summary.stopped) == (
        len(_open_targets()),
        len(_open_targets()),
        None,
    )
    with tenant_context(demo):
        stored = MappingSuggestion.objects.filter(target_requirement_id__in=_open_targets())
        assert {s.model for s in stored} == {"claude-sonnet-5-5"}
        assert ModelCall.objects.count() == summary.asked


def test_a_second_run_asks_nothing_new(demo: Any, ai_service: FakeSuggester) -> None:
    suggest_mappings(demo)

    again = suggest_mappings(demo)

    assert (again.asked, again.created) == (0, 0)


def test_only_the_public_catalogue_reaches_the_ai(demo: Any, ai_service: FakeSuggester) -> None:
    suggest_mappings(demo, limit=1)

    request = ai_service.requests[0]
    sent = json.dumps(request, ensure_ascii=False)
    for private in ["muster-stadtwerke", "Muster-Stadtwerke", "Wasserwerk", "example.com"]:
        assert private not in sent
    candidates = {c["id"] for c in request["candidates"]}
    assert candidates == {r["id"] for r in _fixture("requirements") if r["id"].startswith("req-b-")}


def test_the_daily_cap_stops_a_run_before_the_call(
    demo: Any, ai_service: FakeSuggester, settings: Settings
) -> None:
    settings.MAPPING_SUGGESTION_DAILY_CALLS = 2

    first = suggest_mappings(demo)
    second = suggest_mappings(demo)

    assert (first.asked, first.stopped) == (2, "daily_cap")
    assert (second.asked, second.stopped) == (0, "daily_cap")
    assert len(ai_service.requests) == 2


def test_an_unavailable_service_stops_and_a_declined_target_is_skipped(
    demo: Any, ai_service: FakeSuggester
) -> None:
    ai_service.status = 503
    stopped = suggest_mappings(demo)
    ai_service.status = 502
    skipped = suggest_mappings(demo, limit=2)

    assert (stopped.asked, stopped.stopped) == (1, "unavailable")
    assert (skipped.asked, skipped.declined, skipped.created) == (2, 2, 0)


def test_without_a_configured_service_nothing_is_asked(demo: Any) -> None:
    summary = suggest_mappings(demo)

    assert summary.stopped == "unavailable"


def test_the_command_reports_and_refuses_unknown_tenants(
    demo: Any, ai_service: FakeSuggester
) -> None:
    out = StringIO()

    call_command("suggest_mappings", "muster-stadtwerke", "--limit", "1", stdout=out)

    assert out.getvalue().startswith("Asked 1, 1 new suggestions")
    with pytest.raises(CommandError, match="No Tenant"):
        call_command("suggest_mappings", "nobody")
    ai_service.status = 503
    with pytest.raises(CommandError, match="unavailable"):
        call_command("suggest_mappings", "muster-stadtwerke", stdout=StringIO())
