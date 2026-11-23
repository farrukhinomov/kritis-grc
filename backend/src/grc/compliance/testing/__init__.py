"""A stand-in for the AI service held to its published contract, like the risk engine's."""

import json
from typing import Any

import httpx

from grc.compliance import suggester
from grc.core.testing.contract import Contract

MODEL = "claude-sonnet-5-5"


class FakeSuggester:
    """Answers each target with the first candidate as a partial match, unless told
    otherwise. Every request and answer is validated against the contract."""

    def __init__(self) -> None:
        self.contract = Contract()
        self.requests: list[dict[str, Any]] = []
        self.status = 200

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.path != suggester.GENERATE_PATH:
            return httpx.Response(404)
        body = json.loads(request.content)
        self.contract.validate("GenerateRequest", body)
        self.requests.append(body)
        if self.status != 200:
            return httpx.Response(self.status, json={"code": "model_unavailable"})
        answer = {
            "model": MODEL,
            "prompt_version": "mapping-suggestions/1",
            "suggestions": [
                {
                    "source_requirement_id": body["candidates"][0]["id"],
                    "coverage": "partial",
                    "confidence": 0.5,
                    "rationale_de": "Teilweise Überschneidung.",
                    "rationale_en": "Partial overlap.",
                }
            ],
        }
        self.contract.validate("GenerateResponse", answer)
        return httpx.Response(200, json=answer)
