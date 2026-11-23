"""Domain events: what one module tells the others has happened.

A module describes each event it emits as a `DomainEvent` in its `events` package and
publishes it from a service. Other modules subscribe handlers to it in their own
`events.handlers` module, so the emitting module never learns who reacts.

Handlers can run more than once for the same event and in any order. They treat the
event as a trigger and re-read the current state instead of trusting the payload.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict


class DomainEvent(BaseModel):
    """An immutable fact about one aggregate, named in the past tense.

    The fields are the payload: IDs and the changed facts. `event_type` is stored with
    every event and must never change. Payloads change additively only; a change that
    old handlers can't read gets a new `schema_version`.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    event_type: ClassVar[str]
    schema_version: ClassVar[int] = 1
    aggregate_type: ClassVar[str]

    @property
    def aggregate_id(self) -> str:
        raise NotImplementedError

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)
        name = cls.__dict__.get("event_type")
        if not isinstance(name, str) or not name or not getattr(cls, "aggregate_type", ""):
            raise TypeError(f"{cls.__qualname__} needs a stable `event_type` and its aggregate.")
        known = _events.get(name)
        if known is not None and known.__qualname__ != cls.__qualname__:
            raise TypeError(f"The event type {name!r} is already taken.")
        _events[name] = cls


@dataclass(frozen=True, slots=True)
class Subscription:
    key: str
    event: type[DomainEvent]
    run: Callable[[Any], None]


_events: dict[str, type[DomainEvent]] = {}
_subscriptions: dict[str, Subscription] = {}


def subscribe[E: DomainEvent](
    event: type[E],
) -> Callable[[Callable[[E], None]], Callable[[E], None]]:
    """Registers a handler for `event`, keyed by its import path.

    The key is stored with every pending delivery, so renaming or moving a handler
    strands the deliveries still waiting for the old name.
    """

    def register(handler: Callable[[E], None]) -> Callable[[E], None]:
        key = f"{handler.__module__}.{handler.__qualname__}"
        _subscriptions[key] = Subscription(key, event, handler)
        return handler

    return register


def subscribers(event: type[DomainEvent]) -> list[Subscription]:
    return [s for s in _subscriptions.values() if s.event is event]


def subscription(key: str) -> Subscription | None:
    return _subscriptions.get(key)


def event_class(event_type: str) -> type[DomainEvent] | None:
    return _events.get(event_type)
