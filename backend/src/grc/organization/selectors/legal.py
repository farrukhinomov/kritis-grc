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
    months: int
    # Finance and IT/telecommunications follow their own resilience rules (DORA, the
    # BSIG), so the law spares them the risk analysis and the resilience measures.
    exemptable: bool


# Duties that start with the Registration (§ 8 Abs. 7): the risk analysis after nine
# months, resilience measures, incident reporting and management duties after ten.
_OBLIGATIONS = (
    _Obligation("§ 12", 9, exemptable=True),
    _Obligation("§ 13", 10, exemptable=True),
    _Obligation("§ 18", 10, exemptable=False),
    _Obligation("§ 20", 10, exemptable=False),
)
_EXEMPT_SECTORS = frozenset({"finance", "it_telecom"})


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


def add_months(start: date, months: int) -> date:
    """The same day `months` later, or the month's last day if it is shorter."""
    month_index = start.month - 1 + months
    year, month = start.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))
