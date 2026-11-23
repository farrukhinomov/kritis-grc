"""The eval's own wiring, checked offline: an oracle must score perfectly, a model that
never answers must score nothing, and plumbing errors must not count as answers."""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from evals import run
from evals.grading import Gold, Tally, load_gold, score

from risk_engine.mapping.suggest import MODEL, ModelAnswer, ModelMatch


class Scripted:
    """A model that answers each target from a fixed table."""

    def __init__(self, answers: dict[str, list[tuple[Any, Any]]], model: str = MODEL) -> None:
        self.answers, self.model = answers, model
        self.beta = SimpleNamespace(messages=self)

    def parse(self, **kwargs: Any) -> Any:
        target = kwargs["messages"][0]["content"]
        target_id = next(t for t in self.answers if self._citation(t) in target)
        matches = [
            ModelMatch(
                candidate_id=s,
                coverage=c,
                confidence=0.5,
                rationale_de="x",
                rationale_en="x",
            )
            for s, c in self.answers[target_id]
        ]
        return SimpleNamespace(
            parsed_output=ModelAnswer(matches=matches),
            stop_reason="end_turn",
            model=self.model,
            usage=SimpleNamespace(
                input_tokens=100,
                cache_creation_input_tokens=0,
                cache_read_input_tokens=3000,
                output_tokens=1000,
            ),
        )

    @staticmethod
    def _citation(target_id: str) -> str:
        return run.requirements()[target_id].citation + ":"


def _run(model: Scripted, gold: Gold, reps: int = 2) -> dict[str, Any]:
    catalogue = run.requirements()
    candidates = [r for r in catalogue.values() if r.id.startswith("req-b-")]
    rows = [
        run.run_case(model, catalogue[t], candidates, rep)  # type: ignore[arg-type]
        for rep in range(reps)
        for t in gold.targets
    ]
    return run.summarize(gold, rows, reps)


def test_the_gold_set_names_only_catalogue_requirements() -> None:
    gold = load_gold()
    catalogue = run.requirements()

    pairs = list(gold.positives) + list(gold.negatives)
    assert all(t in catalogue and s in catalogue for t, s in pairs)
    assert all(t.startswith("req-k-") and s.startswith("req-b-") for t, s in pairs)


def test_an_oracle_scores_perfectly() -> None:
    gold = load_gold()
    answers: dict[str, list[tuple[str, str]]] = {t: [] for t in gold.targets}
    for (target, source), coverage in gold.positives.items():
        answers[target].append((source, coverage))

    summary = _run(Scripted(answers), gold)

    assert summary["recall"]["mean"] == 1
    assert summary["precision"]["mean"] == 1
    assert summary["coverage_agreement"]["mean"] == 1
    assert summary["cost_usd"] > 0


def test_a_model_that_finds_nothing_scores_nothing() -> None:
    gold = load_gold()

    summary = _run(Scripted({t: [] for t in gold.targets}), gold)

    assert summary["recall"]["mean"] == 0
    assert summary["precision"] is None  # no answer is not a precise answer


def test_negatives_count_against_precision_and_unknown_pairs_are_set_aside() -> None:
    gold = load_gold()
    (neg_target, neg_source), *_ = sorted(gold.negatives)
    answers: dict[str, list[tuple[str, str]]] = {t: [] for t in gold.targets}
    answers[neg_target] = [(neg_source, "partial"), ("req-b-31-2", "partial")]

    summary = _run(Scripted(answers), gold, reps=1)

    assert summary["precision"]["mean"] == 0
    assert summary["unlabelled_per_run"]["mean"] == 1


def test_another_model_answering_is_counted_not_scored() -> None:
    gold = load_gold()
    answers: dict[str, list[tuple[Any, Any]]] = {t: [] for t in gold.targets}

    summary = _run(Scripted(answers, model="claude-other"), gold, reps=1)

    assert summary["statuses"] == {"other_model": len(gold.targets)}
    assert summary["recall"]["mean"] == 0


def test_score_rejects_nothing_asked() -> None:
    assert score(load_gold(), Tally(), 0).recall == 0.0


def test_the_markdown_summary_has_the_headline_rows(tmp_path: Any) -> None:
    gold = load_gold()
    summary = _run(Scripted({t: [] for t in gold.targets}), gold, reps=1)

    text = run.markdown(summary)

    assert "Recall of curated Mappings" in text
    assert json.dumps(summary)  # serialisable for summary.json


@pytest.mark.parametrize("reply", ["n", ""])
def test_nothing_runs_without_confirmation(reply: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("builtins.input", lambda _: reply)

    assert run.main(["--reps", "1"]) == 1
