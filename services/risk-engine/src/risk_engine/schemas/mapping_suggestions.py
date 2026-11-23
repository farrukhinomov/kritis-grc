"""Request and response of the Mapping Suggestions endpoint.

The request can only carry Requirements: an id, the citation and the statute text.
There is no field for anything about a Tenant, so none can reach the model.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_CANDIDATES = 100
MAX_TEXT_LENGTH = 20_000


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RequirementIn(_Strict):
    id: str = Field(min_length=1, max_length=64)
    citation: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


class GenerateRequest(_Strict):
    target: RequirementIn
    candidates: list[RequirementIn] = Field(min_length=1, max_length=MAX_CANDIDATES)


class SuggestionOut(_Strict):
    source_requirement_id: str
    coverage: Literal["full", "partial"]
    confidence: float = Field(ge=0, le=1)
    rationale_de: str
    rationale_en: str


class GenerateResponse(_Strict):
    model: str
    prompt_version: str
    suggestions: list[SuggestionOut]
