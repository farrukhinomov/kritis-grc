"""Asking the model which candidates cover a target Requirement, and checking its answer.

Only public statute text goes into the request: the caller sends Requirements and
nothing else, and this module adds nothing about who asked. The answer is checked
before anyone sees it: a match naming a candidate that wasn't offered is dropped, as is
anything but full or partial coverage, so a confused answer can't become a suggestion.
"""

import logging
from dataclasses import dataclass
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from risk_engine.mapping.prompt import PROMPT_VERSION, SYSTEM, candidates_block, target_message

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5-5"
MAX_TOKENS = 16_000
# On a policy decline the API re-runs the request on a model it picks for that category.
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ModelMatch(BaseModel):
    candidate_id: str
    coverage: Literal["full", "partial"]
    confidence: float = Field(ge=0, le=1)
    rationale_de: str
    rationale_en: str


class ModelAnswer(BaseModel):
    matches: list[ModelMatch]


@dataclass(frozen=True, slots=True)
class Requirement:
    id: str
    citation: str
    text: str


@dataclass(frozen=True, slots=True)
class Suggestion:
    source_requirement_id: str
    coverage: Literal["full", "partial"]
    confidence: float
    rationale_de: str
    rationale_en: str


@dataclass(frozen=True, slots=True)
class Result:
    model: str
    prompt_version: str
    suggestions: list[Suggestion]


class ModelUnavailableError(RuntimeError):
    """No answer now: not configured, rate-limited, overloaded or unreachable."""


class ModelDeclinedError(RuntimeError):
    """The model gave no usable answer (refused, or cut off before finishing)."""


def suggest(
    client: anthropic.Anthropic | None, target: Requirement, candidates: list[Requirement]
) -> Result:
    if client is None:
        raise ModelUnavailableError("No API key is configured.")
    try:
        response = client.beta.messages.parse(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            betas=[FALLBACK_BETA],
            fallbacks="default",
            output_config={"effort": "high"},
            output_format=ModelAnswer,
            system=[
                {"type": "text", "text": SYSTEM},
                {
                    "type": "text",
                    "text": candidates_block([(c.id, c.citation, c.text) for c in candidates]),
                    # Every target of a run is compared with the same candidates; caching
                    # them makes all calls after the first one cheaper and faster.
                    "cache_control": {"type": "ephemeral"},
                },
            ],
            messages=[{"role": "user", "content": target_message(target.citation, target.text)}],
        )
    except (anthropic.APIConnectionError, anthropic.RateLimitError) as error:
        raise ModelUnavailableError(type(error).__name__) from error
    except anthropic.APIStatusError as error:
        if error.status_code >= 500:
            raise ModelUnavailableError(f"HTTP {error.status_code}") from error
        # A 4xx other than rate limiting is our own mistake (bad key, bad request).
        logger.error("model request rejected", extra={"status": error.status_code})
        raise ModelUnavailableError(f"HTTP {error.status_code}") from error
    usage = response.usage
    logger.info(
        "mapping suggestions answered",
        extra={
            "model": response.model,
            "stop_reason": response.stop_reason,
            "input_tokens": usage.input_tokens,
            "cache_read_input_tokens": usage.cache_read_input_tokens,
            "output_tokens": usage.output_tokens,
        },
    )
    answer = response.parsed_output
    if response.stop_reason != "end_turn" or answer is None:
        raise ModelDeclinedError(str(response.stop_reason))
    return Result(
        model=response.model,
        prompt_version=PROMPT_VERSION,
        suggestions=_checked(answer, target, candidates),
    )


def _checked(
    answer: ModelAnswer, target: Requirement, candidates: list[Requirement]
) -> list[Suggestion]:
    offered = {c.id for c in candidates} - {target.id}
    seen: set[str] = set()
    kept: list[Suggestion] = []
    for match in answer.matches:
        if match.candidate_id not in offered or match.candidate_id in seen:
            continue
        seen.add(match.candidate_id)
        kept.append(
            Suggestion(
                source_requirement_id=match.candidate_id,
                coverage=match.coverage,
                confidence=round(match.confidence, 2),
                rationale_de=match.rationale_de.strip(),
                rationale_en=match.rationale_en.strip(),
            )
        )
    dropped = len(answer.matches) - len(kept)
    if dropped:
        logger.warning("model named candidates that weren't offered", extra={"dropped": dropped})
    return kept
