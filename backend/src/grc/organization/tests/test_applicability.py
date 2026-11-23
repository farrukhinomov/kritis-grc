"""The Applicability Check: whether the KRITIS-Dachgesetz applies, and on what basis."""

import pytest
from django.test import Client

from grc.organization.models import Membership, Role, Tenant, User
from grc.organization.selectors.legal import CRITICAL_SERVICES, check_applicability

TENANT = "/api/v1/tenants/north"
WATER = CRITICAL_SERVICES[0]


def test_reaching_the_threshold_counts() -> None:
    at, below = (check_applicability(WATER, n) for n in (500_000, 499_999))

    assert (at["applies"], below["applies"]) == (True, False)


def test_a_statutory_default_is_not_binding_and_names_its_basis() -> None:
    result = check_applicability(WATER, 600_000)

    assert result == {
        "sector": "water",
        "critical_service": "drinking_water_supply",
        "people_supplied": 600_000,
        "applies": True,
        "threshold": 500_000,
        "threshold_basis": "statutory_default",
        "binding": False,
        "not_binding_reason": "ordinance_pending",
        "registration_within_months": 3,
        "citations": {
            "definition": "§ 2 Nr. 3",
            "threshold": "§ 5 Abs. 2",
            "registration": "§ 8 Abs. 1",
        },
    }


@pytest.fixture
def member(db: None) -> Client:
    tenant = Tenant.objects.create(slug="north", name="North")
    user = User.objects.create_user("auditor@example.com")
    Membership.objects.create(tenant=tenant, user=user, role=Role.AUDITOR)
    client = Client()
    client.force_login(user)
    return client


def test_a_member_checks_a_facility(member: Client) -> None:
    response = member.get(
        f"{TENANT}/applicability-check",
        {
            "sector": "water",
            "critical_service": "drinking_water_supply",
            "people_supplied": "750000",
        },
    )

    assert response.status_code == 200
    assert response.json()["applies"] is True


@pytest.mark.parametrize(
    "query",
    [
        {"sector": "water", "critical_service": "nonsense", "people_supplied": "1"},
        {"sector": "water", "critical_service": "drinking_water_supply", "people_supplied": "1.5"},
        {"sector": "water", "critical_service": "drinking_water_supply", "people_supplied": "-3"},
        {"sector": "water", "critical_service": "drinking_water_supply"},
    ],
)
def test_an_unknown_service_or_a_number_that_isnt_whole_is_refused(
    member: Client, query: dict[str, str]
) -> None:
    response = member.get(f"{TENANT}/applicability-check", query)

    assert response.status_code == 400
    assert response.json()["code"] == "invalid_filter"
