"""Tenants, Scopes, users and their Memberships.

A Tenant is the root of isolation and is not itself tenant-owned. Memberships are read
by user before any Tenant is known (to list where someone may log in), so their
row-level policy also admits a user's own rows; everything else is tenant-owned.
"""

import uuid
from typing import Any, ClassVar

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models

from grc.core.models import TenantOwnedModel


class EmailUserManager(UserManager["User"]):
    def _create_user_object(
        self, username: str | None, email: str | None, password: str | None, **extra: Any
    ) -> "User":
        if not email:
            raise ValueError("A user needs an email address.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        return user

    def create_user(  # type: ignore[override]
        self, email: str, password: str | None = None, **extra: Any
    ) -> "User":
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        user = self._create_user_object(None, email, password, **extra)
        user.save(using=self._db)
        return user

    def create_superuser(  # type: ignore[override]
        self, email: str, password: str | None = None, **extra: Any
    ) -> "User":
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        user = self._create_user_object(None, email, password, **extra)
        user.save(using=self._db)
        return user


class User(AbstractUser):
    """A person who logs in with an email address. Access comes only from Memberships."""

    username = None  # type: ignore[assignment]
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=200, blank=True)
    job_title = models.CharField(max_length=200, blank=True)
    # Shared, password-less accounts behind the public demo logins. They can only be
    # entered through the demo login and never get a usable password.
    is_demo_account = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects: ClassVar[EmailUserManager] = EmailUserManager()


class Theme(models.TextChoices):
    SAAR_GREEN = "saar-green", "Saar Green"
    BLUE = "blue", "Blue"
    HIGH_CONTRAST = "high-contrast", "High Contrast"


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    theme = models.CharField(max_length=32, choices=Theme.choices, default=Theme.SAAR_GREEN)
    sector = models.CharField(max_length=64, blank=True)
    is_demo = models.BooleanField(default=False)

    def __str__(self) -> str:
        return self.name


class Scope(TenantOwnedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)

    def __str__(self) -> str:
        return self.name


class Role(models.TextChoices):
    GRC_MANAGER = "grc_manager", "GRC Manager"
    AUDITOR = "auditor", "Auditor"


class Membership(models.Model):
    """A user's access to one Tenant, with one role and optionally limited to Scopes."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="+")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=32, choices=Role.choices)
    scopes = models.ManyToManyField(Scope, through="MembershipScope", related_name="+")

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["tenant", "user"], name="one_membership_per_tenant"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.tenant_id} as {self.role}"


class MembershipScope(TenantOwnedModel):
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="+")
    scope = models.ForeignKey(Scope, on_delete=models.CASCADE, related_name="+")

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["membership", "scope"], name="unique_membership_scope"),
        ]
