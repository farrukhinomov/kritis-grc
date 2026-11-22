"""Who is acting, for which Tenant, with which rights.

Every service receives an Actor and checks the permission it needs itself, so the check
holds whichever entry point calls the service: a view, an event handler or a script.
"""

from dataclasses import dataclass
from enum import StrEnum
from uuid import UUID

from rest_framework import status

from grc.core.problems import Problem


class Permission(StrEnum):
    VIEW = "view"
    CHANGE = "change"
    APPROVE = "approve"


# A Membership's role decides its permissions; there is no per-user exception.
ROLE_PERMISSIONS: dict[str, frozenset[Permission]] = {
    "auditor": frozenset({Permission.VIEW}),
    "grc_manager": frozenset({Permission.VIEW, Permission.CHANGE, Permission.APPROVE}),
}


@dataclass(frozen=True)
class Actor:
    user_id: int
    membership_id: UUID
    tenant_id: UUID
    role: str
    # None means the whole Tenant; otherwise only these Scopes are visible and editable.
    scope_ids: frozenset[UUID] | None = None

    def can(self, permission: Permission) -> bool:
        return permission in ROLE_PERMISSIONS.get(self.role, frozenset())

    def require(self, permission: Permission) -> None:
        if not self.can(permission):
            raise Problem(
                status.HTTP_403_FORBIDDEN,
                "permission_denied",
                "Your role in this Tenant does not allow this.",
            )

    def sees_scope(self, scope_id: UUID) -> bool:
        return self.scope_ids is None or scope_id in self.scope_ids
