"""Hazards and Risks. Only this module writes these tables."""

import uuid

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
