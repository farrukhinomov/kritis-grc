"""Domain events this module emits, and handlers for events it reacts to."""

from typing import ClassVar
from uuid import UUID

from grc.core.events import DomainEvent


class ImplementationStatusChanged(DomainEvent):
    """An Implementation moved between open, partial, implemented and not applicable."""

    event_type: ClassVar[str] = "compliance.implementation_status_changed"
    aggregate_type: ClassVar[str] = "implementation"

    implementation_id: UUID
    from_status: str
    to_status: str

    @property
    def aggregate_id(self) -> str:
        return str(self.implementation_id)
