import pytest

from risk_engine.domain.residual import (
    METHOD_VERSION,
    Dimension,
    ImplementationStatus,
    Rating,
    RiskCategory,
    Treatment,
    assess,
)

IMPLEMENTED = ImplementationStatus.IMPLEMENTED
PARTIAL = ImplementationStatus.PARTIAL


def treatment(
    dimension: Dimension = Dimension.LIKELIHOOD,
    levels: int = 1,
    status: ImplementationStatus = IMPLEMENTED,
    implementation_id: str = "impl-1",
) -> Treatment:
    return Treatment(implementation_id, dimension, levels, status)


def test_without_treatments_the_residual_equals_the_inherent_rating() -> None:
    result = assess(Rating(likelihood=3, impact=4), [])

    assert result.residual == Rating(likelihood=3, impact=4)
    assert result.explanations == ()


def test_an_implemented_treatment_lowers_its_dimension_by_its_full_levels() -> None:
    result = assess(Rating(4, 4), [treatment(Dimension.LIKELIHOOD, levels=2)])

    assert result.residual == Rating(likelihood=2, impact=4)


@pytest.mark.parametrize(("levels", "expected_reduction"), [(1, 0), (2, 1), (3, 1)])
def test_a_partial_implementation_counts_at_half_effect_rounded_down(
    levels: int, expected_reduction: int
) -> None:
    result = assess(Rating(4, 4), [treatment(Dimension.IMPACT, levels, PARTIAL)])

    assert result.residual.impact == 4 - expected_reduction


@pytest.mark.parametrize("status", [ImplementationStatus.OPEN, ImplementationStatus.NOT_APPLICABLE])
def test_open_or_not_applicable_implementations_have_no_effect(
    status: ImplementationStatus,
) -> None:
    result = assess(Rating(3, 3), [treatment(levels=2, status=status)])

    assert result.residual == Rating(3, 3)


def test_effects_on_the_same_dimension_add_up() -> None:
    result = assess(
        Rating(4, 4),
        [treatment(levels=1, implementation_id="a"), treatment(levels=2, implementation_id="b")],
    )

    assert result.residual.likelihood == 1


def test_a_rating_never_drops_below_the_lowest_level() -> None:
    result = assess(Rating(2, 2), [treatment(Dimension.IMPACT, levels=3)])

    assert result.residual.impact == 1


def test_every_treatment_is_explained_with_the_levels_actually_applied() -> None:
    result = assess(
        Rating(4, 4),
        [
            treatment(Dimension.LIKELIHOOD, 2, IMPLEMENTED, "a"),
            treatment(Dimension.IMPACT, 3, PARTIAL, "b"),
            treatment(Dimension.IMPACT, 2, ImplementationStatus.OPEN, "c"),
        ],
    )

    assert [(e.implementation_id, e.levels_applied) for e in result.explanations] == [
        ("a", 2),
        ("b", 1),
        ("c", 0),
    ]


@pytest.mark.parametrize(
    ("rating", "category"),
    [
        (Rating(1, 1), RiskCategory.LOW),
        (Rating(1, 2), RiskCategory.LOW),
        (Rating(1, 3), RiskCategory.MEDIUM),
        (Rating(2, 2), RiskCategory.MEDIUM),
        (Rating(2, 3), RiskCategory.HIGH),
        (Rating(2, 4), RiskCategory.HIGH),
        (Rating(3, 3), RiskCategory.CRITICAL),
        (Rating(4, 4), RiskCategory.CRITICAL),
    ],
)
def test_category_follows_the_matrix_score(rating: Rating, category: RiskCategory) -> None:
    result = assess(rating, [])

    assert result.category is category
    assert result.score == rating.likelihood * rating.impact


@pytest.mark.parametrize(("likelihood", "impact"), [(0, 1), (5, 1), (1, 0), (1, 5)])
def test_ratings_outside_the_matrix_are_rejected(likelihood: int, impact: int) -> None:
    with pytest.raises(ValueError, match="between 1 and 4"):
        Rating(likelihood, impact)


def test_the_method_is_versioned() -> None:
    assert METHOD_VERSION == "qualitative-4x4/1"
