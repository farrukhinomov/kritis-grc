"""Stored events and their per-handler deliveries.

An event is written in the same transaction as the change it describes, so it exists
exactly when the change does. Each subscribed handler gets its own delivery row with its
own attempts and backoff, so a failing handler is retried without re-running the ones
that already succeeded.
"""

import uuid
from typing import ClassVar

from django.db import models
from django.utils import timezone

from grc.core.models import TenantOwnedModel


class OutboxEvent(TenantOwnedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=100)
    schema_version = models.PositiveSmallIntegerField()
    occurred_at = models.DateTimeField(default=timezone.now)
    # A plain ID, not a key: the event outlives its actor's account.
    actor_id = models.BigIntegerField(null=True)
    aggregate_type = models.CharField(max_length=64)
    aggregate_id = models.CharField(max_length=64)
    payload = models.JSONField()
    # The publishing request's trace continues in the handlers, even after a retry.
    trace_id = models.CharField(max_length=32, blank=True)

    def __str__(self) -> str:
        return f"{self.type} ({self.id})"


class DeliveryStatus(models.TextChoices):
    PENDING = "pending", "pending"
    DELIVERED = "delivered", "delivered"
    DEAD = "dead", "dead"


class OutboxDelivery(TenantOwnedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(OutboxEvent, on_delete=models.CASCADE, related_name="deliveries")
    handler = models.CharField(max_length=200)
    status = models.CharField(
        max_length=16, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING
    )
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    # Only the error's type: a message can quote tenant data, and the log has the rest.
    last_error = models.CharField(max_length=200, blank=True)
    delivered_at = models.DateTimeField(null=True)

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["event", "handler"], name="one_delivery_per_handler"),
        ]
        indexes: ClassVar = [
            models.Index(
                fields=["tenant", "next_attempt_at"],
                condition=models.Q(status="pending"),
                name="outbox_due_deliveries",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.handler} for {self.event_id}"
