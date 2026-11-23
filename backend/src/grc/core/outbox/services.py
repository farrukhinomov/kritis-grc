"""Publishing domain events and delivering them to their handlers.

`publish` stores the event and one delivery per handler in the caller's transaction and
tries them right after it commits. Whatever fails then waits for `drain`, which a worker
calls in a loop. Every delivery runs in its own transaction, acting for its event's
Tenant: the handler's writes and the delivery's new state commit together, and one
handler's failure never touches another's.

Rows are claimed with `FOR UPDATE SKIP LOCKED`, so concurrent workers never run the same
delivery and never wait for each other. The drain walks Tenant by Tenant instead of
scanning all deliveries at once, so it needs no way around row-level security.
"""

import logging
import random
from collections.abc import Callable, Iterable
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from grc.core import request_context
from grc.core.events import DomainEvent, event_class, subscribers, subscription
from grc.core.history import acting_user_id
from grc.core.outbox.models import DeliveryStatus, OutboxDelivery, OutboxEvent
from grc.core.purge import purge_rows
from grc.core.tenancy import NotInTransactionError, current_tenant_id, tenant_transaction

logger = logging.getLogger(__name__)

# Retries back off exponentially up to an hour; eight attempts span about two hours,
# long enough to ride out a deploy or a restart of the risk engine.
MAX_ATTEMPTS = 8
FIRST_RETRY = timedelta(seconds=30)
LONGEST_RETRY = timedelta(hours=1)


def publish(event: DomainEvent) -> None:
    """Stores `event` for every subscribed handler, as part of the current transaction."""
    if not connection.in_atomic_block:
        raise NotInTransactionError("Events are published inside the change's transaction.")
    tenant_id = current_tenant_id()
    stored = OutboxEvent.objects.create(
        type=event.event_type,
        schema_version=event.schema_version,
        actor_id=acting_user_id(),
        aggregate_type=event.aggregate_type,
        aggregate_id=event.aggregate_id,
        payload=event.model_dump(mode="json"),
        trace_id=_known(request_context.current_trace_id()),
    )
    deliveries = OutboxDelivery.objects.bulk_create(
        OutboxDelivery(event=stored, handler=s.key, tenant_id=tenant_id)
        for s in subscribers(type(event))
    )
    if deliveries:
        # Robust: a failure after commit must never turn the caller's success into an
        # error. The delivery stays pending and the drain retries it.
        ids = [d.id for d in deliveries]

        def deliver_now() -> None:
            for delivery_id in ids:
                _run_next(tenant_id, delivery_id)

        transaction.on_commit(deliver_now, robust=True)


def drain(limit: int = 100) -> int:
    """Runs up to `limit` due deliveries across all Tenants; returns how many ran."""
    tenants: Callable[[], Iterable[UUID]] = import_string(settings.GRC_OUTBOX_TENANTS)
    ran = 0
    for tenant_id in tenants():
        while ran < limit and _run_next(tenant_id):
            ran += 1
    return ran


def revive_dead() -> int:
    """Gives every dead delivery a fresh set of attempts, once its cause is fixed."""
    tenants: Callable[[], Iterable[UUID]] = import_string(settings.GRC_OUTBOX_TENANTS)
    revived = 0
    for tenant_id in tenants():
        with tenant_transaction(tenant_id):
            revived += OutboxDelivery.objects.filter(status=DeliveryStatus.DEAD).update(
                status=DeliveryStatus.PENDING, attempts=0, next_attempt_at=timezone.now()
            )
    return revived


def backoff(attempts: int) -> timedelta:
    """The wait before the next attempt, after `attempts` failed ones.

    Randomized between half and all of the exponential delay, so deliveries that failed
    together (the engine was down) don't all come back in the same second.
    """
    # The exponent is capped: the ceiling is reached long before, and the product must
    # stay within what a timedelta can hold.
    ceiling = min(LONGEST_RETRY, FIRST_RETRY * (1 << min(attempts - 1, 16)))
    return ceiling * random.uniform(0.5, 1.0)  # noqa: S311 - spreads load, not a secret


def _run_next(tenant_id: UUID, delivery_id: UUID | None = None) -> bool:
    """Runs the next due delivery of the Tenant, or the given one if it is still due."""
    with tenant_transaction(tenant_id):
        due = OutboxDelivery.objects.filter(
            status=DeliveryStatus.PENDING, next_attempt_at__lte=timezone.now()
        )
        if delivery_id is not None:
            due = due.filter(id=delivery_id)
        # Re-evaluated under the lock, so a delivery finished by another worker in the
        # meantime is no longer pending and is not run twice.
        delivery = (
            due.order_by("next_attempt_at")
            .select_for_update(skip_locked=True, of=("self",))
            .select_related("event")
            .first()
        )
        if delivery is None:
            return False
        # Right after commit the publishing request's IDs still apply; in the drain,
        # a fresh request ID joins the publisher's trace.
        current = request_context.current_request_id()
        tokens = request_context.bind(
            current if current != "-" else request_context.resolve_request_id(None),
            delivery.event.trace_id or request_context.resolve_trace_id(None),
        )
        try:
            _run(delivery)
        finally:
            request_context.unbind(tokens)
        return True


def _run(delivery: OutboxDelivery) -> None:
    handler = subscription(delivery.handler)
    kind = event_class(delivery.event.type)
    if (
        handler is None
        or kind is None
        or handler.event is not kind
        or kind.schema_version != delivery.event.schema_version
    ):
        # Nothing can ever run it; retrying would only hide that until the last attempt.
        logger.error("outbox delivery has no handler", extra=_describe(delivery))
        _failed(delivery, "UnknownHandler", final=True)
        return
    try:
        event = kind.model_validate(delivery.event.payload)
        with transaction.atomic():
            handler.run(event)
    # Any error a handler raises is this delivery's failure and nobody else's.
    except Exception as error:
        logger.warning("outbox handler failed", exc_info=True, extra=_describe(delivery))
        _failed(delivery, type(error).__name__, final=False)
        return
    delivery.attempts += 1
    delivery.status = DeliveryStatus.DELIVERED
    delivery.delivered_at = timezone.now()
    delivery.last_error = ""
    delivery.save(update_fields=["attempts", "status", "delivered_at", "last_error"])


def _failed(delivery: OutboxDelivery, error: str, *, final: bool) -> None:
    delivery.attempts += 1
    delivery.last_error = error[:200]
    if final or delivery.attempts >= MAX_ATTEMPTS:
        delivery.status = DeliveryStatus.DEAD
        logger.error("outbox delivery is dead", extra=_describe(delivery))
    else:
        delivery.next_attempt_at = timezone.now() + backoff(delivery.attempts)
    delivery.save(update_fields=["attempts", "last_error", "status", "next_attempt_at"])


def _describe(delivery: OutboxDelivery) -> dict[str, object]:
    return {
        "delivery_id": str(delivery.id),
        "event_id": str(delivery.event_id),
        "event_type": delivery.event.type,
        "handler": delivery.handler,
        "attempts": delivery.attempts,
    }


def _known(value: str) -> str:
    # The request context reports "-" outside a request.
    return "" if value == "-" else value


def purge_tenant_data() -> int:
    """Removes the active Tenant's events and deliveries, for the Demo Tenant reset."""
    return purge_rows([OutboxDelivery, OutboxEvent])
