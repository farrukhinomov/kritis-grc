"""API Tokens: issuing, finding and revoking them.

A token is `grc_<prefix>_<secret>`. The prefix finds the row; the stored SHA-256 of the
whole token proves the rest. A fast hash is enough here, unlike for passwords: the
secret is 256 random bits, so there is nothing to guess. Tokens are found before any
Tenant is known, so their rows are also visible by prefix while one is being checked.
"""

import hashlib
import hmac
import secrets
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.db import connection, transaction
from django.utils import timezone
from rest_framework import status

from grc.core.actor import Actor, Permission
from grc.core.problems import FieldProblem, Problem
from grc.core.tenancy import tenant_context
from grc.organization.models import ApiToken, Membership, Role, TokenScope

PREFIX_BYTES = 6
SECRET_BYTES = 32
MAX_DAYS = 365


def issue(actor: Actor, name: str, scope: str, expires_in_days: int) -> tuple[ApiToken, str]:
    """A new token for the actor's own Membership; the full value exists only in the answer."""
    actor.require(Permission.VIEW)
    if scope == TokenScope.READ_WRITE and actor.role != Role.GRC_MANAGER:
        # A token never has more rights than its Membership.
        raise FieldProblem([{"field": "scope", "code": "invalid_choice"}])
    prefix = secrets.token_hex(PREFIX_BYTES)
    token = f"grc_{prefix}_{secrets.token_urlsafe(SECRET_BYTES)}"
    row: ApiToken = ApiToken.objects.create(
        membership_id=actor.membership_id,
        name=name,
        prefix=prefix,
        token_hash=_hash(token),
        scope=scope,
        expires_at=timezone.now() + timedelta(days=expires_in_days),
    )
    return row, token


def revoke(actor: Actor, token_id: UUID) -> None:
    actor.require(Permission.VIEW)
    updated = ApiToken.objects.filter(
        id=token_id, membership_id=actor.membership_id, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    if not updated:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")


def find(raw: str) -> ApiToken | None:
    """The valid token `raw` names, or None for anything malformed, unknown, expired or revoked."""
    parts = raw.split("_", 2)
    if len(parts) != 3 or parts[0] != "grc" or len(parts[1]) != PREFIX_BYTES * 2:
        return None
    # Its own (nested) transaction, so the prefix setting is transaction-local even where
    # the surrounding request runs without one.
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SELECT set_config('app.token_prefix', %s, true)", [parts[1]])
            token: ApiToken | None = ApiToken._base_manager.filter(prefix=parts[1]).first()
            cursor.execute("SELECT set_config('app.token_prefix', '', true)")
        if token is None or not hmac.compare_digest(token.token_hash, _hash(raw)):
            return None
        # The Membership is only visible within its Tenant, which the token now names.
        with tenant_context(token.tenant_id):
            token.membership = Membership._base_manager.select_related("user").get(
                id=token.membership_id
            )
    if token.revoked_at is not None or token.expires_at <= timezone.now():
        return None
    if not token.membership.user.is_active:
        return None
    return token


def present(token: ApiToken) -> dict[str, Any]:
    def when(value: Any) -> str | None:
        return value.isoformat().replace("+00:00", "Z") if value else None

    return {
        "id": str(token.id),
        "name": token.name,
        "prefix": token.prefix,
        "scope": token.scope,
        "created_at": when(token.created_at),
        "expires_at": when(token.expires_at),
        "revoked_at": when(token.revoked_at),
    }


def tokens_of(actor: Actor) -> Any:
    return ApiToken.objects.filter(membership_id=actor.membership_id).order_by("-created_at")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
