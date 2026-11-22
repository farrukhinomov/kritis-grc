"""Recording changes for the Activity Log.

Postgres triggers record every write to a tracked model, including bulk updates and raw
SQL, so no code path can change data without leaving a trace. Who acted is attached as
context for the transaction and stored on each event row itself, never in a shared
context table, which would have no Tenant and mix every Tenant's request metadata.
"""

from collections.abc import Callable, Iterable, Iterator
from contextlib import contextmanager
from typing import Any, TypeVar

import pghistory

M = TypeVar("M")


def tracked(*, exclude: Iterable[str] = ()) -> Callable[[M], M]:
    """Records creation, every change of a non-excluded field, and deletion."""
    decorator: Callable[[M], M] = pghistory.track(
        pghistory.InsertEvent("created"),
        pghistory.UpdateEvent("updated"),
        pghistory.DeleteEvent("deleted"),
        exclude=list(exclude),
        context_field=pghistory.ContextJSONField(),
        obj_field=pghistory.ObjForeignKey(related_name="+"),
    )
    return decorator


@contextmanager
def acting(user_id: int, membership_id: Any) -> Iterator[None]:
    """Names who caused the writes of the current transaction."""
    with pghistory.context(user=user_id, membership=str(membership_id)):
        yield
