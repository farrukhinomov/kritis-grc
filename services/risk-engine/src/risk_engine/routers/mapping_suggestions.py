from http import HTTPStatus

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from risk_engine import problems
from risk_engine.mapping.suggest import (
    ModelDeclinedError,
    ModelUnavailableError,
    Requirement,
    suggest,
)
from risk_engine.schemas.mapping_suggestions import (
    GenerateRequest,
    GenerateResponse,
    SuggestionOut,
)

router = APIRouter(tags=["mapping suggestions"])

# The caller's outbox retries later; a minute is enough for a rate limit to clear.
RETRY_AFTER_SECONDS = "60"


# A plain `def`: the SDK call blocks, so FastAPI runs it in its thread pool.
@router.post(
    "/v1/mapping-suggestions:generate",
    response_model=GenerateResponse,
    responses={
        502: {"description": "The model gave no usable answer."},
        503: {"description": "No model answer now; retry later."},
    },
)
def generate(body: GenerateRequest, request: Request) -> GenerateResponse | JSONResponse:
    """Suggest which candidate Requirements fully or partly cover the target."""
    try:
        result = suggest(
            request.app.state.anthropic,
            Requirement(body.target.id, body.target.citation, body.target.text),
            [Requirement(c.id, c.citation, c.text) for c in body.candidates],
        )
    except ModelUnavailableError:
        return problems.problem(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "model_unavailable",
            "No model answer is available right now.",
            headers={"Retry-After": RETRY_AFTER_SECONDS},
        )
    except ModelDeclinedError:
        return problems.problem(
            HTTPStatus.BAD_GATEWAY, "model_declined", "The model gave no usable answer."
        )
    return GenerateResponse(
        model=result.model,
        prompt_version=result.prompt_version,
        suggestions=[
            SuggestionOut(
                source_requirement_id=s.source_requirement_id,
                coverage=s.coverage,
                confidence=s.confidence,
                rationale_de=s.rationale_de,
                rationale_en=s.rationale_en,
            )
            for s in result.suggestions
        ],
    )
