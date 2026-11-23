"""Score and category of a rating on the fixed 4x4 matrix.

The risk engine owns the rating method and calculates every Residual Rating. The
Inherent and Target Ratings are set by people and only need their score and band to be
shown and filtered, so those two rules are repeated here. They belong to the method
version below and change only together with it.
"""

from grc.risk.models import RiskCategory

METHOD_VERSION = "qualitative-4x4/1"

# The highest score of each band, lowest band first.
BANDS: tuple[tuple[int, RiskCategory], ...] = (
    (2, RiskCategory.LOW),
    (4, RiskCategory.MEDIUM),
    (8, RiskCategory.HIGH),
    (16, RiskCategory.CRITICAL),
)


def categorize(score: int) -> RiskCategory:
    return next(category for highest, category in BANDS if score <= highest)


def score_range(category: str) -> tuple[int, int]:
    """The lowest and highest score of a band, for filtering in the database."""
    lowest = 1
    for highest, band in BANDS:
        if band == category:
            return lowest, highest
        lowest = highest + 1
    raise ValueError(category)


def rating(likelihood: int, impact: int) -> dict[str, object]:
    score = likelihood * impact
    return {
        "likelihood": likelihood,
        "impact": impact,
        "score": score,
        "category": categorize(score).value,
    }
