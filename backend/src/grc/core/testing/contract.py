"""Holding test doubles to the risk engine's published contract.

The engine exports its OpenAPI schema (`services/risk-engine/openapi.json`, kept current
by CI). Validating every request and answer of a stand-in against it means a change to
either side that breaks the other fails the backend's tests.
"""

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

CONTRACT = Path(__file__).resolve().parents[5] / "services" / "risk-engine" / "openapi.json"


class Contract:
    def __init__(self) -> None:
        document = json.loads(CONTRACT.read_text(encoding="utf-8"))
        self._components = {"components": document["components"]}

    def validate(self, schema: str, body: Any) -> None:
        Draft202012Validator(
            {"$ref": f"#/components/schemas/{schema}", **self._components}
        ).validate(body)
