from fastapi import APIRouter

from risk_engine.domain.residual import METHOD_VERSION, Rating, Treatment, assess
from risk_engine.schemas.risk_scores import (
    BatchRequest,
    BatchResponse,
    ExplanationOut,
    RatingOut,
    RiskIn,
    RiskScoreOut,
)

router = APIRouter(tags=["risk scores"])


# A plain `def`: the calculation is CPU-bound, so FastAPI runs it in its thread pool
# instead of blocking the event loop.
@router.post("/v1/risk-scores:batch")
def score_batch(request: BatchRequest) -> BatchResponse:
    """Calculate the Residual Rating of every Risk in the batch."""
    return BatchResponse(
        method_version=METHOD_VERSION,
        results=[_score(risk) for risk in request.risks],
    )


def _score(risk: RiskIn) -> RiskScoreOut:
    assessment = assess(
        Rating(risk.inherent.likelihood, risk.inherent.impact),
        [
            Treatment(t.implementation_id, t.dimension, t.levels, t.implementation_status)
            for t in risk.treatments
        ],
    )
    return RiskScoreOut(
        risk_id=risk.risk_id,
        residual=RatingOut(
            likelihood=assessment.residual.likelihood,
            impact=assessment.residual.impact,
        ),
        score=assessment.score,
        category=assessment.category,
        explanations=[
            ExplanationOut(
                implementation_id=e.implementation_id,
                dimension=e.dimension,
                implementation_status=e.status,
                levels_applied=e.levels_applied,
            )
            for e in assessment.explanations
        ],
    )
