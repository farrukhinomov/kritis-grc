"""How Residual Ratings follow the work they depend on.

Each handler re-reads the current state and recalculates from it, so running twice or
out of order gives the same result. An unreachable risk engine raises, which leaves the
delivery pending for the outbox to retry; the Risk meanwhile shows "pending".
"""

from grc.compliance.events import ImplementationStatusChanged
from grc.core.events import subscribe
from grc.risk.events import RiskRatingInputsChanged
from grc.risk.services.rating import recalculate, risks_treated_by


@subscribe(ImplementationStatusChanged)
def rerate_treated_risks(event: ImplementationStatusChanged) -> None:
    recalculate(risks_treated_by(event.implementation_id))


@subscribe(RiskRatingInputsChanged)
def rerate_risk(event: RiskRatingInputsChanged) -> None:
    recalculate([event.risk_id])
