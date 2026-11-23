"""Run the Mapping Suggestions eval against the real model.

    ANTHROPIC_API_KEY=... uv run python -m evals.run --reps 3

Every call costs money (about 2 US cents each; see the estimate printed first), so this
runs on prompt or gold-set changes, not on every pull request. It calls the service's
own entry point (`risk_engine.mapping.suggest.suggest`) with the production prompt and
settings, so it measures what ships. Results, including each raw answer, go to
`evals/results/<timestamp>/`: `results.jsonl` for answers, `errors.jsonl` for attempts
that produced none, and `summary.md` for the numbers.
"""

import argparse
import json
import statistics
import sys
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anthropic

from evals.grading import Gold, Scores, Tally, load_gold, score
from risk_engine.mapping.prompt import PROMPT_VERSION
from risk_engine.mapping.suggest import (
    MODEL,
    ModelDeclinedError,
    ModelUnavailableError,
    Requirement,
    Result,
    suggest,
)

SEED = Path(__file__).resolve().parents[3] / "seed" / "requirements.json"
RESULTS = Path(__file__).with_name("results")
# US dollars per million tokens for MODEL; cache writes (5 minutes) cost 1.25x input.
PRICE = {"input": 2.00, "cache_write": 2.50, "cache_read": 0.10, "output": 10.00}
# A rough upper bound per call for the estimate: thinking at high effort dominates.
ESTIMATED_OUTPUT_TOKENS = 2_500


def requirements() -> dict[str, Requirement]:
    rows = json.loads(SEED.read_text(encoding="utf-8"))
    return {r["id"]: Requirement(r["id"], r["citation"], r["text_de"]) for r in rows}


def cost(usage: dict[str, int]) -> float:
    return (
        usage["input_tokens"] * PRICE["input"]
        + usage["cache_creation_input_tokens"] * PRICE["cache_write"]
        + usage["cache_read_input_tokens"] * PRICE["cache_read"]
        + usage["output_tokens"] * PRICE["output"]
    ) / 1_000_000


def estimate(calls: int) -> float:
    return calls * ESTIMATED_OUTPUT_TOKENS * PRICE["output"] / 1_000_000


def run_case(
    client: anthropic.Anthropic,
    target: Requirement,
    candidates: list[Requirement],
    rep: int,
) -> dict[str, Any]:
    started = time.monotonic()
    base: dict[str, Any] = {"case": target.id, "rep": rep}
    try:
        result: Result = suggest(client, target, candidates)
    except ModelDeclinedError as error:
        # A refusal or a cut-off answer is the model's outcome, scored as "no answer".
        return {**base, "status": "declined", "reason": str(error)}
    except ModelUnavailableError as error:
        return {**base, "status": "error", "reason": str(error)}
    return {
        **base,
        # A refusal fallback answered with another model: counted, never mixed in.
        "status": "ok" if result.model == MODEL else "other_model",
        "model": result.model,
        "suggestions": [[s.source_requirement_id, s.coverage] for s in result.suggestions],
        "raw_matches": result.raw_matches,
        "usage": asdict(result.usage),
        "latency_s": round(time.monotonic() - started, 2),
    }


def summarize(gold: Gold, rows: list[dict[str, Any]], reps: int) -> dict[str, Any]:
    per_rep: list[Scores] = []
    unlabelled: dict[tuple[str, str, str], int] = {}
    for rep in range(reps):
        tally = Tally()
        for row in rows:
            if row["rep"] == rep and row["status"] == "ok":
                tally.add(gold, row["case"], [tuple(s) for s in row["suggestions"]])
        for pair in tally.unlabelled_pairs:
            unlabelled[pair] = unlabelled.get(pair, 0) + 1
        asked = sum(1 for t, _ in gold.positives if _answered(rows, t, rep))
        per_rep.append(score(gold, tally, asked))
    usages = [row["usage"] for row in rows if "usage" in row]
    return {
        "prompt_version": PROMPT_VERSION,
        "gold_version": gold.version,
        "model": MODEL,
        "reps": reps,
        "cases": len(gold.targets),
        "recall": _spread([s.recall for s in per_rep]),
        "precision": _spread([s.precision for s in per_rep if s.precision is not None]),
        "coverage_agreement": _spread(
            [s.coverage_agreement for s in per_rep if s.coverage_agreement is not None]
        ),
        "unlabelled_per_run": _spread([float(s.unlabelled) for s in per_rep]),
        "unlabelled_pairs": [
            {"target": t, "source": s, "coverage": c, "runs": n}
            for (t, s, c), n in sorted(unlabelled.items())
        ],
        "statuses": {
            status: sum(1 for r in rows if r["status"] == status)
            for status in sorted({r["status"] for r in rows})
        },
        "cost_usd": round(sum(cost(u) for u in usages), 4),
        "cache_read_share": _share(usages),
        "latency_s_median": statistics.median([r["latency_s"] for r in rows if "latency_s" in r])
        if usages
        else None,
    }


def markdown(summary: dict[str, Any]) -> str:
    def fmt(spread: dict[str, float] | None) -> str:
        if not spread:
            return "n/a"
        return f"{spread['mean']:.2f} (min {spread['min']:.2f}, max {spread['max']:.2f})"

    return "\n".join(
        [
            f"| Metric ({summary['model']}, {summary['prompt_version']}, "
            f"gold v{summary['gold_version']}, {summary['reps']} runs) | Value |",
            "|---|---|",
            f"| Recall of curated Mappings | {fmt(summary['recall'])} |",
            f"| Precision over labelled pairs | {fmt(summary['precision'])} |",
            f"| Coverage level agrees | {fmt(summary['coverage_agreement'])} |",
            f"| Unlabelled suggestions per run | {fmt(summary['unlabelled_per_run'])} |",
            f"| Outcomes | {summary['statuses']} |",
            f"| Cost of this eval | ${summary['cost_usd']} |",
            "",
        ]
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reps", type=int, default=3)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--yes", action="store_true", help="Skip the cost confirmation.")
    args = parser.parse_args(argv)

    gold = load_gold()
    catalogue = requirements()
    candidates = [r for r in catalogue.values() if r.id.startswith("req-b-")]
    jobs = [(catalogue[t], rep) for rep in range(args.reps) for t in gold.targets]
    sys.stdout.write(
        f"{len(jobs)} calls to {MODEL}, estimated at most ${estimate(len(jobs)):.2f}.\n"
    )
    if not args.yes and input("Run? [y/N] ").strip().lower() != "y":
        return 1

    client = anthropic.Anthropic()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        rows = list(pool.map(lambda job: run_case(client, job[0], candidates, job[1]), jobs))

    out = RESULTS / datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out.mkdir(parents=True)
    answered = [r for r in rows if r["status"] != "error"]
    _write_jsonl(out / "results.jsonl", answered)
    _write_jsonl(out / "errors.jsonl", [r for r in rows if r["status"] == "error"])
    summary = summarize(gold, answered, args.reps)
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (out / "summary.md").write_text(markdown(summary))
    sys.stdout.write(markdown(summary) + f"\nWritten to {out}\n")
    return 0


def _answered(rows: list[dict[str, Any]], target: str, rep: int) -> bool:
    return any(r["case"] == target and r["rep"] == rep for r in rows)


def _spread(values: list[float]) -> dict[str, float] | None:
    if not values:
        return None
    return {"mean": statistics.fmean(values), "min": min(values), "max": max(values)}


def _share(usages: list[dict[str, int]]) -> float | None:
    total = sum(
        u["input_tokens"] + u["cache_creation_input_tokens"] + u["cache_read_input_tokens"]
        for u in usages
    )
    return round(sum(u["cache_read_input_tokens"] for u in usages) / total, 3) if total else None


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))


if __name__ == "__main__":
    sys.exit(main())
