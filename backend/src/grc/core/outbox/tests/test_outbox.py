"""The outbox delivers each event once per handler, after commit, retrying failures."""

import os
import signal
import threading
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager
from datetime import timedelta
from pathlib import Path
from typing import Any, ClassVar
from uuid import UUID, uuid4

import pytest
from django.apps import apps
from django.core.management import call_command
from django.db import connection, transaction
from django.utils import timezone

from grc.core.events import DomainEvent, subscribe
from grc.core.history import acting
from grc.core.outbox.models import DeliveryStatus, OutboxDelivery, OutboxEvent
from grc.core.outbox.services import (
    FIRST_RETRY,
    LONGEST_RETRY,
    MAX_ATTEMPTS,
    backoff,
    drain,
    publish,
)
from grc.core.tenancy import NotInTransactionError, current_tenant_id, tenant_transaction


class SomethingHappened(DomainEvent):
    event_type: ClassVar[str] = "test.something_happened"
    aggregate_type: ClassVar[str] = "thing"
    thing_id: UUID

    @property
    def aggregate_id(self) -> str:
        return str(self.thing_id)


class NobodyListens(DomainEvent):
    event_type: ClassVar[str] = "test.nobody_listens"
    aggregate_type: ClassVar[str] = "nothing"

    @property
    def aggregate_id(self) -> str:
        return "-"


seen: list[tuple[UUID, UUID]] = []
failing = {"on": False}


@subscribe(SomethingHappened)
def remember(event: SomethingHappened) -> None:
    seen.append((event.thing_id, current_tenant_id()))


@subscribe(SomethingHappened)
def sometimes_fail(event: SomethingHappened) -> None:
    if failing["on"]:
        raise RuntimeError("the risk engine is down")


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    seen.clear()
    failing["on"] = False
    yield
    failing["on"] = False


def _tenant(slug: str) -> UUID:
    # The core can't import the organization module; the model is looked up by name.
    tenant = apps.get_model("organization", "Tenant").objects.create(slug=slug, name=slug)
    tenant_id: UUID = tenant.id
    return tenant_id


class ChangeFailedError(Exception):
    pass


def _publish_then_fail(block: Callable[[], AbstractContextManager[None]]) -> None:
    with block():
        publish(SomethingHappened(thing_id=uuid4()))
        raise ChangeFailedError


def _deliveries(tenant_id: UUID) -> dict[str, OutboxDelivery]:
    with tenant_transaction(tenant_id):
        return {d.handler.rsplit(".", 1)[1]: d for d in OutboxDelivery.objects.all()}


def _make_due(tenant_id: UUID) -> None:
    with tenant_transaction(tenant_id):
        OutboxDelivery.objects.update(next_attempt_at=timezone.now() - timedelta(seconds=1))


@pytest.mark.django_db(transaction=True)
def test_publishing_needs_the_changes_transaction() -> None:
    with pytest.raises(NotInTransactionError):
        publish(SomethingHappened(thing_id=uuid4()))


@pytest.mark.django_db
def test_an_event_is_delivered_right_after_commit_acting_for_its_tenant(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id, thing_id = _tenant("north"), uuid4()

    with django_capture_on_commit_callbacks(execute=True), tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=thing_id))
        assert seen == []  # nothing runs before the change is committed

    assert seen == [(thing_id, tenant_id)]
    assert {d.status for d in _deliveries(tenant_id).values()} == {DeliveryStatus.DELIVERED}


@pytest.mark.django_db
def test_an_event_rolled_back_with_its_change_is_never_delivered(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id = _tenant("north")

    with (
        django_capture_on_commit_callbacks(execute=True) as callbacks,
        pytest.raises(ChangeFailedError),
    ):
        _publish_then_fail(lambda: tenant_transaction(tenant_id))

    assert callbacks == []
    assert _deliveries(tenant_id) == {}
    assert drain() == 0


@pytest.mark.django_db
def test_an_event_nobody_subscribes_to_is_stored_without_deliveries(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id = _tenant("north")

    with django_capture_on_commit_callbacks(execute=True), tenant_transaction(tenant_id):
        publish(NobodyListens())

    with tenant_transaction(tenant_id):
        stored = OutboxEvent.objects.get()
    assert (stored.type, stored.schema_version, stored.aggregate_type, stored.actor_id) == (
        "test.nobody_listens",
        1,
        "nothing",
        None,
    )
    assert _deliveries(tenant_id) == {}


@pytest.mark.django_db
def test_a_failing_handler_is_retried_later_without_rerunning_the_others(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id = _tenant("north")
    failing["on"] = True

    with django_capture_on_commit_callbacks(execute=True), tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))

    failed = _deliveries(tenant_id)["sometimes_fail"]
    assert failed.status == DeliveryStatus.PENDING
    assert (failed.attempts, failed.last_error) == (1, "RuntimeError")
    assert failed.next_attempt_at > timezone.now()
    assert drain() == 0  # not due yet

    failing["on"] = False
    _make_due(tenant_id)
    assert drain() == 1

    assert len(seen) == 1  # the handler that had succeeded did not run again
    assert _deliveries(tenant_id)["sometimes_fail"].status == DeliveryStatus.DELIVERED


@pytest.mark.django_db
def test_a_delivery_that_keeps_failing_ends_dead(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id = _tenant("north")
    failing["on"] = True
    with django_capture_on_commit_callbacks(execute=True), tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))

    for _ in range(MAX_ATTEMPTS - 1):
        _make_due(tenant_id)
        drain()

    failed = _deliveries(tenant_id)["sometimes_fail"]
    assert (failed.status, failed.attempts) == (DeliveryStatus.DEAD, MAX_ATTEMPTS)
    _make_due(tenant_id)
    assert drain() == 0


@pytest.mark.django_db
def test_a_delivery_for_a_handler_that_no_longer_exists_is_dead_at_once() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        event = OutboxEvent.objects.create(
            type="test.something_happened",
            schema_version=1,
            aggregate_type="thing",
            aggregate_id="-",
            payload={},
        )
        OutboxDelivery.objects.create(event=event, handler="grc.gone.handler")

    assert drain() == 1

    gone = _deliveries(tenant_id)["handler"]
    assert (gone.status, gone.last_error) == (DeliveryStatus.DEAD, "UnknownHandler")


@pytest.mark.django_db
def test_the_drain_works_through_every_tenant_each_acting_for_its_own() -> None:
    north, south = _tenant("north"), _tenant("south")
    for tenant_id in (north, south):
        with tenant_transaction(tenant_id):
            publish(SomethingHappened(thing_id=tenant_id))

    assert drain() == 4

    assert sorted(seen) == sorted([(north, north), (south, south)])


@pytest.mark.django_db
def test_the_drain_stops_at_its_limit() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))

    assert drain(limit=1) == 1
    assert drain() == 1


@pytest.mark.django_db
def test_the_command_drains_once() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))

    call_command("drain_outbox")

    assert len(seen) == 1


@pytest.mark.django_db(transaction=True)
def test_two_drains_never_run_the_same_delivery() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))
    # The real commit delivered at once; both deliveries are made due again for the drains.
    with tenant_transaction(tenant_id):
        OutboxDelivery.objects.update(status=DeliveryStatus.PENDING)
    seen.clear()
    locked, release = threading.Event(), threading.Event()

    def hold_one_delivery() -> None:
        # Another worker in the middle of running a delivery holds its row lock.
        try:
            with tenant_transaction(tenant_id):
                OutboxDelivery.objects.select_for_update().filter(
                    handler__endswith=".remember"
                ).get()
                locked.set()
                release.wait(10)
        finally:
            connection.close()

    worker = threading.Thread(target=hold_one_delivery)
    worker.start()
    try:
        assert locked.wait(10)
        assert drain() == 1  # skips the locked row instead of waiting or running it
        assert seen == []
    finally:
        release.set()
        worker.join()

    assert drain() == 1
    assert len(seen) == 1


def test_retries_back_off_exponentially_within_bounds() -> None:
    assert FIRST_RETRY / 2 <= backoff(1) <= FIRST_RETRY
    assert FIRST_RETRY <= backoff(2) <= FIRST_RETRY * 2
    assert LONGEST_RETRY / 2 <= backoff(MAX_ATTEMPTS + 10) <= LONGEST_RETRY


def test_an_event_needs_a_unique_stable_name() -> None:
    with pytest.raises(TypeError, match="stable"):

        class Nameless(DomainEvent):
            aggregate_type: ClassVar[str] = "thing"

    with pytest.raises(TypeError, match="taken"):

        class Impostor(DomainEvent):
            event_type: ClassVar[str] = "test.something_happened"
            aggregate_type: ClassVar[str] = "thing"


def test_rolled_back_savepoint_drops_its_events(
    django_capture_on_commit_callbacks: Callable[..., Any], db: None
) -> None:
    tenant_id = _tenant("north")

    with (
        django_capture_on_commit_callbacks(execute=True),
        tenant_transaction(tenant_id),
        pytest.raises(ChangeFailedError),
    ):
        _publish_then_fail(transaction.atomic)

    assert seen == []
    assert _deliveries(tenant_id) == {}


@pytest.mark.django_db
def test_the_event_names_who_acted(
    django_capture_on_commit_callbacks: Callable[..., Any],
) -> None:
    tenant_id, thing_id = _tenant("north"), uuid4()

    with tenant_transaction(tenant_id), acting(42, uuid4()):
        publish(SomethingHappened(thing_id=thing_id))

    with tenant_transaction(tenant_id):
        stored = OutboxEvent.objects.get()
    assert (stored.actor_id, stored.aggregate_id) == (42, str(thing_id))


@pytest.mark.django_db
def test_an_event_stored_in_another_schema_version_is_dead_at_once() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))
        OutboxEvent.objects.update(schema_version=2)

    assert drain() == 2

    assert {d.status for d in _deliveries(tenant_id).values()} == {DeliveryStatus.DEAD}
    assert seen == []


@pytest.mark.django_db
def test_dead_deliveries_can_be_revived_after_a_fix() -> None:
    tenant_id = _tenant("north")
    with tenant_transaction(tenant_id):
        publish(SomethingHappened(thing_id=uuid4()))
        OutboxDelivery.objects.update(status=DeliveryStatus.DEAD, attempts=MAX_ATTEMPTS)

    call_command("drain_outbox", "--revive-dead")

    assert len(seen) == 1
    assert {d.status for d in _deliveries(tenant_id).values()} == {DeliveryStatus.DELIVERED}


@pytest.mark.django_db(transaction=True)
def test_the_loop_stops_cleanly_when_the_container_stops(tmp_path: Path) -> None:
    heartbeat = tmp_path / "alive"

    def stop_soon() -> None:
        os.kill(os.getpid(), signal.SIGTERM)

    timer = threading.Timer(0.2, stop_soon)
    previous = signal.getsignal(signal.SIGTERM)
    timer.start()
    try:
        call_command(
            "drain_outbox", "--loop", "--interval", "0.05", "--heartbeat-file", str(heartbeat)
        )
    finally:
        timer.cancel()
        signal.signal(signal.SIGTERM, previous)
        signal.signal(signal.SIGINT, signal.default_int_handler)

    assert heartbeat.exists()  # proof of life for the container's health check
