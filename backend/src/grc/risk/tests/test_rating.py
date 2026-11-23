import pytest

from grc.risk.selectors.rating import categorize, rating, score_range

# The bands of the method version, cell by cell, as the risk engine defines them.
EXPECTED = {
    "low": {1, 2},
    "medium": {3, 4},
    "high": {6, 8},
    "critical": {9, 12, 16},
}


def test_every_cell_of_the_matrix_falls_in_the_engines_band() -> None:
    scores = {likelihood * impact for likelihood in range(1, 5) for impact in range(1, 5)}

    assert {s: categorize(s).value for s in scores} == {
        s: band for band, members in EXPECTED.items() for s in members
    }


def test_score_ranges_cover_each_band_exactly() -> None:
    assert [score_range(band) for band in EXPECTED] == [(1, 2), (3, 4), (5, 8), (9, 16)]
    with pytest.raises(ValueError, match="unknown"):
        score_range("unknown")


def test_a_rating_carries_its_score_and_band() -> None:
    assert rating(3, 4) == {"likelihood": 3, "impact": 4, "score": 12, "category": "critical"}
