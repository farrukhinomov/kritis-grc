"""Legal deadlines of the Critical Facilities, from their Registration and Risk Assessments."""

from datetime import date
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.ids import fixture_uuid
from grc.organization.selectors.legal import Facility, tenant_deadlines

TENANT = "/api/v1/tenants/muster-stadtwerke"


def _facility(**overrides: Any) -> Facility:
    values: dict[str, Any] = {
        "scope_id": "f",
        "name": "Plant",
        "sector": "water",
        "registration_date": date(2027, 1, 31),
        "confirmed": False,
    }
    return Facility(**{**values, **overrides})


def test_the_registration_starts_four_duties_projected_while_it_is_planned() -> None:
    items = tenant_deadlines([_facility()])

    assert [(i["citation"], i["due_date"]) for i in items] == [
        ("§ 12", "2027-10-31"),
        ("§ 13", "2027-11-30"),  # the 31st doesn't exist in November
        ("§ 18", "2027-11-30"),
        ("§ 20", "2027-11-30"),
    ]
    assert {(i["binding"], i["basis"]) for i in items} == {(False, "planned_registration")}


def test_a_confirmed_registration_binds_and_an_approved_assessment_is_renewed() -> None:
    items = tenant_deadlines([_facility(confirmed=True, assessed_on=date(2027, 6, 1))])

    renewal = next(i for i in items if i["obligation"] == "risk_assessment_renewal")
    assert renewal == {
        "scope_id": "f",
        "scope_name": "Plant",
        "citation": "§ 12",
        "obligation": "risk_assessment_renewal",
        "due_date": "2031-06-01",
        "binding": True,
        "basis": "approved_risk_assessment",
    }
    assert all(i["binding"] for i in items)


def test_exempt_sectors_owe_neither_the_analysis_nor_its_renewal() -> None:
    items = tenant_deadlines([_facility(sector="finance", assessed_on=date(2027, 6, 1))])

    assert [i["citation"] for i in items] == ["§ 18", "§ 20"]


@pytest.mark.django_db
def test_the_demo_tenants_deadlines_soonest_first(settings: Settings) -> None:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "auditor"}, content_type="application/json")

    items = client.get(f"{TENANT}/deadlines").json()["items"]

    assert [i["due_date"] for i in items] == sorted(i["due_date"] for i in items)
    south = str(fixture_uuid("muster-stadtwerke", "sc-sued"))
    renewals = [i for i in items if i["obligation"] == "risk_assessment_renewal"]
    # Only the south plant has an approved assessment (2025-11-03).
    assert [(r["scope_id"], r["due_date"]) for r in renewals] == [(south, "2029-11-03")]
    assert len(items) == 2 * 4 + 1
