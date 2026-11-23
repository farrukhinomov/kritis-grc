"""A stand-in for the risk engine that holds both sides to the engine's real contract.

Every request Django sends and every answer it gets is validated against the OpenAPI
schema the engine exports (`services/risk-engine/openapi.json`, kept current by CI), so
a change to either side that breaks the other fails here. The calculation itself is
the engine's to test; this one follows the same published method so results are real.
"""

import json
from typing import Any

import httpx

from grc.core.testing.contract import Contract
from grc.risk import engine

METHOD_VERSION = "qualitative-4x4/1"


class FakeRiskEngine:
    def __init__(self) -> None:
        self.contract = Contract()
        self.requests: list[dict[str, Any]] = []
        self.down = False

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)

    def validate(self, schema: str, body: Any) -> None:
        self.contract.validate(schema, body)

    def _handle(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("engine down", request=request)
        if request.url.path != engine.BATCH_PATH:
            return httpx.Response(404)
        body = json.loads(request.content)
        self.validate("BatchRequest", body)
        self.requests.append(body)
        answer = {
            "method_version": METHOD_VERSION,
            "results": [self._score(risk) for risk in body["risks"]],
        }
        self.validate("BatchResponse", answer)
        return httpx.Response(200, json=answer)

    @staticmethod
    def _score(risk: dict[str, Any]) -> dict[str, Any]:
        explanations = []
        lowered = {"likelihood": 0, "impact": 0}
        for t in risk["treatments"]:
            status = t["implementation_status"]
            applied = {"implemented": t["levels"], "partial": t["levels"] // 2}.get(status, 0)
            lowered[t["dimension"]] += applied
            explanations.append(
                {
                    "implementation_id": t["implementation_id"],
                    "dimension": t["dimension"],
                    "implementation_status": status,
                    "levels_applied": applied,
                }
            )
        likelihood = max(1, risk["inherent"]["likelihood"] - lowered["likelihood"])
        impact = max(1, risk["inherent"]["impact"] - lowered["impact"])
        score = likelihood * impact
        category = next(
            c
            for top, c in ((2, "low"), (4, "medium"), (8, "high"), (16, "critical"))
            if score <= top
        )
        return {
            "risk_id": risk["risk_id"],
            "residual": {"likelihood": likelihood, "impact": impact},
            "score": score,
            "category": category,
            "explanations": explanations,
        }
