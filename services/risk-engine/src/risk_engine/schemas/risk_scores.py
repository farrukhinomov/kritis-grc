"""Request and response bodies of the risk-score endpoint.

Bounds are part of the contract: they keep a single request's work predictable and
reject ratings that don't exist on the matrix before any calculation runs.
"""

from pydantic import BaseModel, ConfigDict, Field

from risk_engine.domain.residual import (
    HIGHEST_LEVEL,
    LOWEST_LEVEL,
    Dimension,
    ImplementationStatus,
    RiskCategory,
)

MAX_RISKS_PER_BATCH = 500
MAX_TREATMENTS_PER_RISK = 50
# Lowering by more than this would always hit the floor of the matrix.
MAX_TREATMENT_LEVELS = HIGHEST_LEVEL - LOWEST_LEVEL
MAX_ID_LENGTH = 64


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RatingIn(_Strict):
    likelihood: int = Field(ge=LOWEST_LEVEL, le=HIGHEST_LEVEL)
    impact: int = Field(ge=LOWEST_LEVEL, le=HIGHEST_LEVEL)


class TreatmentIn(_Strict):
    implementation_id: str = Field(min_length=1, max_length=MAX_ID_LENGTH)
    dimension: Dimension
    levels: int = Field(ge=1, le=MAX_TREATMENT_LEVELS)
    implementation_status: ImplementationStatus


class RiskIn(_Strict):
    risk_id: str = Field(min_length=1, max_length=MAX_ID_LENGTH)
    inherent: RatingIn
    treatments: list[TreatmentIn] = Field(default_factory=list, max_length=MAX_TREATMENTS_PER_RISK)


class BatchRequest(_Strict):
    risks: list[RiskIn] = Field(min_length=1, max_length=MAX_RISKS_PER_BATCH)


class RatingOut(_Strict):
    likelihood: int
    impact: int


class ExplanationOut(_Strict):
    implementation_id: str
    dimension: Dimension
    implementation_status: ImplementationStatus
    levels_applied: int


class RiskScoreOut(_Strict):
    risk_id: str
    residual: RatingOut
    score: int
    category: RiskCategory
    explanations: list[ExplanationOut]


class BatchResponse(_Strict):
    method_version: str
    results: list[RiskScoreOut]
