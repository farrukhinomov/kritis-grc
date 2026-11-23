"""What the KRITIS-Dachgesetz says about Critical Facilities, as data and pure functions.

Kept in one place because the thresholds ordinance is still a draft: when it is in force,
this is where the numbers and their basis change.
"""

import calendar
from dataclasses import dataclass
from datetime import date
from typing import Any


@dataclass(frozen=True)
class CriticalServiceDefinition:
    sector: str
    critical_service: str
    measure: str
    threshold: int
    # The statute's default value until the ordinance sets its own.
    threshold_basis: str
    citation: str

    def present(self) -> dict[str, Any]:
        return {
            "sector": self.sector,
            "critical_service": self.critical_service,
            "measure": self.measure,
            "threshold": self.threshold,
            "threshold_basis": self.threshold_basis,
            "citation": self.citation,
        }


CRITICAL_SERVICES = (
    CriticalServiceDefinition(
        sector="water",
        critical_service="drinking_water_supply",
        measure="people_supplied",
        threshold=500_000,
        threshold_basis="statutory_default",
        citation="§ 5 Abs. 2",
    ),
)


@dataclass(frozen=True)
class _Obligation:
    citation: str
    obligation: str
    months: int
    # Finance and IT/telecommunications follow their own resilience rules (DORA, the
    # BSIG), so the law spares them the risk analysis and the resilience measures.
    exemptable: bool


# Duties that start with the Registration (§ 8 Abs. 7): the risk analysis after nine
# months, resilience measures, incident reporting and management duties after ten.
_OBLIGATIONS = (
    _Obligation("§ 12", "risk_analysis", 9, exemptable=True),
    _Obligation("§ 13", "resilience_measures", 10, exemptable=True),
    _Obligation("§ 18", "incident_reporting", 10, exemptable=False),
    _Obligation("§ 20", "management_duties", 10, exemptable=False),
)
_EXEMPT_SECTORS = frozenset({"finance", "it_telecom"})
# § 12 asks for a new Risk Assessment at least every four years.
RISK_ASSESSMENT_VALID_MONTHS = 48


@dataclass(frozen=True)
class Facility:
    """What the deadlines of one Critical Facility depend on."""

    scope_id: str
    name: str
    sector: str
    registration_date: date
    confirmed: bool
    # The date of its latest approved Risk Assessment, if any.
    assessed_on: date | None = None


def service_for(sector: str, critical_service: str) -> CriticalServiceDefinition | None:
    return next(
        (
            s
            for s in CRITICAL_SERVICES
            if s.sector == sector and s.critical_service == critical_service
        ),
        None,
    )


def deadlines_for(registration_date: date, confirmed: bool, sector: str) -> list[dict[str, Any]]:
    """A planned Registration only projects the deadlines; a confirmed one binds them."""
    return [
        {
            "citation": o.citation,
            "due_date": add_months(registration_date, o.months).isoformat(),
            "binding": confirmed,
        }
        for o in _OBLIGATIONS
        if not (o.exemptable and sector in _EXEMPT_SECTORS)
    ]


def tenant_deadlines(facilities: list[Facility]) -> list[dict[str, Any]]:
    """Every deadline of every Critical Facility, soonest first.

    The duties that start with the Registration, and the renewal of the latest approved
    Risk Assessment. A renewal binds only as much as the facility's duties do, so it
    follows the Registration; exempt sectors owe neither the analysis nor its renewal.
    """
    items: list[dict[str, Any]] = []
    for facility in facilities:
        basis = "confirmed_registration" if facility.confirmed else "planned_registration"
        exempt = facility.sector in _EXEMPT_SECTORS
        for o in _OBLIGATIONS:
            if o.exemptable and exempt:
                continue
            items.append(
                _deadline(
                    facility,
                    o.citation,
                    o.obligation,
                    add_months(facility.registration_date, o.months),
                    basis,
                )
            )
        if facility.assessed_on is not None and not exempt:
            items.append(
                _deadline(
                    facility,
                    "§ 12",
                    "risk_assessment_renewal",
                    add_months(facility.assessed_on, RISK_ASSESSMENT_VALID_MONTHS),
                    "approved_risk_assessment",
                )
            )
    return sorted(items, key=lambda item: (item["due_date"], item["scope_name"]))


def _deadline(
    facility: Facility, citation: str, obligation: str, due: date, basis: str
) -> dict[str, Any]:
    return {
        "scope_id": facility.scope_id,
        "scope_name": facility.name,
        "citation": citation,
        "obligation": obligation,
        "due_date": due.isoformat(),
        "binding": facility.confirmed,
        "basis": basis,
    }


def add_months(start: date, months: int) -> date:
    """The same day `months` later, or the month's last day if it is shorter."""
    month_index = start.month - 1 + months
    year, month = start.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
