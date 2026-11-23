"""Domain events this module emits."""

from typing import ClassVar
from uuid import UUID

from grc.core.events import DomainEvent


class RiskRatingInputsChanged(DomainEvent):
    """A Risk's Inherent Rating or Treatments changed, so its Residual Rating is stale."""

    event_type: ClassVar[str] = "risk.rating_inputs_changed"
    aggregate_type: ClassVar[str] = "risk"

    risk_id: UUID

    @property
    def aggregate_id(self) -> str:
        return str(self.risk_id)
