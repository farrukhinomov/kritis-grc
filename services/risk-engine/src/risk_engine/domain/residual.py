"""Residual risk on the fixed 4x4 qualitative matrix.

A person rates a Risk's inherent likelihood and impact. Each Treatment links the Risk to
an Implementation and states how many levels it lowers one dimension. Only work that is
actually in place counts: an implemented Implementation applies its full effect, a
partial one half of it rounded down, anything else none.

The result is tagged with METHOD_VERSION and stored with it, so past scores stay
reproducible after the method changes. Changing any rule here requires a new version.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

METHOD_VERSION = "qualitative-4x4/1"

LOWEST_LEVEL = 1
HIGHEST_LEVEL = 4


class Dimension(StrEnum):
    LIKELIHOOD = "likelihood"
    IMPACT = "impact"


class ImplementationStatus(StrEnum):
    OPEN = "open"
    PARTIAL = "partial"
    IMPLEMENTED = "implemented"
    NOT_APPLICABLE = "not_applicable"


class RiskCategory(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass(frozen=True, slots=True)
class Rating:
    likelihood: int
    impact: int

    def __post_init__(self) -> None:
        for value in (self.likelihood, self.impact):
            if not LOWEST_LEVEL <= value <= HIGHEST_LEVEL:
                raise ValueError(f"Ratings must be between {LOWEST_LEVEL} and {HIGHEST_LEVEL}")

    @property
    def score(self) -> int:
        return self.likelihood * self.impact


@dataclass(frozen=True, slots=True)
class Treatment:
    implementation_id: str
    dimension: Dimension
    levels: int
    status: ImplementationStatus


@dataclass(frozen=True, slots=True)
class Explanation:
    """What one Treatment contributes, before the floor of the matrix is applied.

    Per Treatment rather than net, so a user sees every measure's effect even when the
    rating already sits at the lowest level.
    """

    implementation_id: str
    dimension: Dimension
    status: ImplementationStatus
    levels_applied: int


@dataclass(frozen=True, slots=True)
class Assessment:
    residual: Rating
    score: int
    category: RiskCategory
    explanations: tuple[Explanation, ...]


def assess(inherent: Rating, treatments: Sequence[Treatment]) -> Assessment:
    explanations = tuple(
        Explanation(t.implementation_id, t.dimension, t.status, _effect(t)) for t in treatments
    )
    residual = Rating(
        likelihood=_lowered(inherent.likelihood, Dimension.LIKELIHOOD, explanations),
        impact=_lowered(inherent.impact, Dimension.IMPACT, explanations),
    )
    return Assessment(residual, residual.score, categorize(residual.score), explanations)


def categorize(score: int) -> RiskCategory:
    # Four bands over the 16 cells (scores 1-16), matching the usual heat-map colors:
    # the bands grow with the score so a single step at the high end weighs more.
    if score <= 2:
        return RiskCategory.LOW
    if score <= 4:
        return RiskCategory.MEDIUM
    if score <= 8:
        return RiskCategory.HIGH
    return RiskCategory.CRITICAL


def _effect(treatment: Treatment) -> int:
    match treatment.status:
        case ImplementationStatus.IMPLEMENTED:
            return treatment.levels
        case ImplementationStatus.PARTIAL:
            return treatment.levels // 2
        case _:
            return 0


def _lowered(level: int, dimension: Dimension, explanations: Sequence[Explanation]) -> int:
    reduction = sum(e.levels_applied for e in explanations if e.dimension is dimension)
    return max(LOWEST_LEVEL, level - reduction)
