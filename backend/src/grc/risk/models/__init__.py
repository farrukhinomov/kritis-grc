"""Hazards and Risks. Only this module writes these tables."""

import uuid
from typing import ClassVar

from django.db import models

from grc.core.history import tracked
from grc.core.models import TenantOwnedModel


class HazardCategory(models.TextChoices):
    NATURAL = "natural", "natural"
    TECHNICAL = "technical", "technical"
    HUMAN = "human", "human-made"


@tracked()
class Hazard(TenantOwnedModel):
    """A kind of event that could disrupt a Critical Service.

    Each Tenant has its own catalogue: it starts from the platform's sample and is
    edited to the national risk analyses, which aren't public.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.CharField(max_length=16, choices=HazardCategory.choices)
    name_de = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200)
    description_de = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name_de


class Dimension(models.TextChoices):
    LIKELIHOOD = "likelihood", "likelihood"
    IMPACT = "impact", "impact"


class RiskCategory(models.TextChoices):
    LOW = "low", "low"
    MEDIUM = "medium", "medium"
    HIGH = "high", "high"
    CRITICAL = "critical", "critical"


LOWEST_LEVEL, HIGHEST_LEVEL = 1, 4


def _level(name: str) -> models.CheckConstraint:
    return models.CheckConstraint(
        condition=models.Q(**{f"{name}__gte": LOWEST_LEVEL, f"{name}__lte": HIGHEST_LEVEL}),
        name=f"risk_{name}_on_the_matrix",
    )


# The calculated rating is history, not a person's change: it is recorded but only the
# people's edits appear in the Activity Log.
@tracked()
class Risk(TenantOwnedModel):
    """One Hazard affecting one Critical Facility, optionally through specific Assets.

    A person sets the Inherent and Target Ratings. The Residual Rating comes from the
    risk engine and is stored with the method version that produced it; it is empty
    while no calculation has succeeded yet.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.ForeignKey("organization.Scope", on_delete=models.CASCADE, related_name="+")
    hazard = models.ForeignKey(Hazard, on_delete=models.PROTECT, related_name="+")
    title_de = models.CharField(max_length=300)
    owner = models.ForeignKey(
        "organization.User", on_delete=models.SET_NULL, null=True, related_name="+"
    )
    inherent_likelihood = models.PositiveSmallIntegerField()
    inherent_impact = models.PositiveSmallIntegerField()
    target_likelihood = models.PositiveSmallIntegerField()
    target_impact = models.PositiveSmallIntegerField()
    residual_likelihood = models.PositiveSmallIntegerField(null=True)
    residual_impact = models.PositiveSmallIntegerField(null=True)
    residual_score = models.PositiveSmallIntegerField(null=True)
    residual_category = models.CharField(max_length=16, choices=RiskCategory.choices, blank=True)
    residual_explanation = models.JSONField(default=list)
    method_version = models.CharField(max_length=64, blank=True)
    residual_calculated_at = models.DateTimeField(null=True)

    class Meta:
        constraints: ClassVar = [
            _level("inherent_likelihood"),
            _level("inherent_impact"),
            _level("target_likelihood"),
            _level("target_impact"),
            # Either a complete Residual Rating or none at all, never half of one.
            models.CheckConstraint(
                condition=(
                    models.Q(
                        residual_likelihood__isnull=True,
                        residual_impact__isnull=True,
                        residual_score__isnull=True,
                        method_version="",
                    )
                    | models.Q(
                        residual_likelihood__isnull=False,
                        residual_impact__isnull=False,
                        residual_score__isnull=False,
                        method_version__gt="",
                    )
                ),
                name="risk_residual_complete_or_pending",
            ),
        ]
        indexes: ClassVar = [models.Index(fields=["tenant", "scope"], name="risk_by_scope")]

    def __str__(self) -> str:
        return self.title_de


class RiskAsset(TenantOwnedModel):
    """An Asset a Risk affects, in the order the Risk names them."""

    risk = models.ForeignKey(Risk, on_delete=models.CASCADE, related_name="affected")
    asset = models.ForeignKey("assets.Asset", on_delete=models.CASCADE, related_name="+")
    position = models.PositiveSmallIntegerField()

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(fields=["risk", "asset"], name="unique_risk_asset"),
        ]

    def __str__(self) -> str:
        return f"{self.risk_id} affects {self.asset_id}"


@tracked()
class Treatment(TenantOwnedModel):
    """A link from a Risk to an Implementation that lowers one dimension by some levels."""

    risk = models.ForeignKey(Risk, on_delete=models.CASCADE, related_name="treatments")
    implementation = models.ForeignKey(
        "compliance.Implementation", on_delete=models.CASCADE, related_name="+"
    )
    dimension = models.CharField(max_length=16, choices=Dimension.choices)
    levels = models.PositiveSmallIntegerField()
    position = models.PositiveSmallIntegerField()

    class Meta:
        constraints: ClassVar = [
            models.UniqueConstraint(
                fields=["risk", "implementation", "dimension"], name="one_treatment_per_dimension"
            ),
            # Lowering by more than the matrix is high would always hit its floor.
            models.CheckConstraint(
                condition=models.Q(levels__gte=1, levels__lte=HIGHEST_LEVEL - LOWEST_LEVEL),
                name="treatment_levels_on_the_matrix",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.implementation_id} lowers {self.dimension} of {self.risk_id}"
