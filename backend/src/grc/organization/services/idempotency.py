"""Idempotency-Key handling for creating requests.

A client that retries a create after a lost answer sends the same key and gets the first
answer again instead of a second row. The same key with a different request is refused,
so a client bug can't silently return an unrelated object. Keys belong to one user in
one Tenant and are forgotten after a day.
"""

import hashlib
import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from django.utils import timezone
from rest_framework import status

from grc.core.actor import Actor
from grc.core.problems import Problem
from grc.organization.models import IdempotencyRecord

KEEP_FOR = timedelta(hours=24)
MAX_KEY_LENGTH = 200

Answer = tuple[int, Any]


def once(
    actor: Actor, key: str | None, request: Any, run: Callable[[], Answer]
) -> tuple[int, Any, bool]:
    """Runs `run` the first time for this key and request, then replays its answer.

    Returns the status, the body and whether it is a replay.
    """
    if key is None:
        return (*run(), False)
    if not key or len(key) > MAX_KEY_LENGTH:
        raise Problem(
            status.HTTP_400_BAD_REQUEST, "invalid_idempotency_key", "The key is empty or too long."
        )
    fingerprint = hashlib.sha256(
        json.dumps(request, sort_keys=True, default=str).encode()
    ).hexdigest()
    IdempotencyRecord.objects.filter(created_at__lt=timezone.now() - KEEP_FOR).delete()
    stored = IdempotencyRecord.objects.filter(user_id=actor.user_id, key=key).first()
    if stored is not None:
        if stored.fingerprint != fingerprint:
            raise Problem(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "idempotency_key_reused",
                "This key was already used for another request.",
            )
        return stored.status, stored.body, True
    answer = run()
    IdempotencyRecord.objects.create(
        user_id=actor.user_id,
        key=key,
        fingerprint=fingerprint,
        status=answer[0],
        body=answer[1],
    )
    return (*answer, False)
