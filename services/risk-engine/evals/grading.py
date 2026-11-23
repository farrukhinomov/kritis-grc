"""Turning suggestions into scores. Pure functions, so the grading is tested offline.

Per target, each suggested pair is a true positive (in the gold positives), a false
positive (in the gold negatives) or unlabelled (in neither: reviewed by hand, never
counted as wrong). Recall counts the gold positives found; precision is over labelled
suggestions only. Coverage agreement is how often a found positive has the gold's
coverage level.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

GOLD = Path(__file__).with_name("gold.json")


@dataclass(frozen=True)
class Gold:
    version: int
    positives: dict[tuple[str, str], str]
    negatives: frozenset[tuple[str, str]]

    @property
    def targets(self) -> list[str]:
        return sorted({t for t, _ in self.positives} | {t for t, _ in self.negatives})


def load_gold(path: Path = GOLD) -> Gold:
    raw = json.loads(path.read_text(encoding="utf-8"))
    positives = {(p["target"], p["source"]): p["coverage"] for p in raw["positives"]}
    negatives = frozenset((n["target"], n["source"]) for n in raw["negatives"])
    if set(positives) & negatives:
        raise ValueError("A pair can't be both a positive and a negative.")
    return Gold(raw["version"], positives, negatives)


@dataclass
class Tally:
    true_positives: int = 0
    false_positives: int = 0
    unlabelled: int = 0
    coverage_agrees: int = 0
    unlabelled_pairs: list[tuple[str, str, str]] = field(default_factory=list)

    def add(self, gold: Gold, target: str, suggestions: list[tuple[str, str]]) -> None:
        for source, coverage in suggestions:
            pair = (target, source)
            if pair in gold.positives:
                self.true_positives += 1
                self.coverage_agrees += gold.positives[pair] == coverage
            elif pair in gold.negatives:
                self.false_positives += 1
            else:
                self.unlabelled += 1
                self.unlabelled_pairs.append((target, source, coverage))


@dataclass(frozen=True)
class Scores:
    recall: float
    # None when nothing labelled was suggested: no suggestion is not a precise one.
    precision: float | None
    coverage_agreement: float | None
    unlabelled: int


def score(gold: Gold, tally: Tally, positives_asked: int) -> Scores:
    labelled = tally.true_positives + tally.false_positives
    return Scores(
        recall=tally.true_positives / positives_asked if positives_asked else 0.0,
        precision=tally.true_positives / labelled if labelled else None,
        coverage_agreement=(
            tally.coverage_agrees / tally.true_positives if tally.true_positives else None
        ),
        unlabelled=tally.unlabelled,
    )
