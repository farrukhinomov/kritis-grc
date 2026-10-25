import json
from pathlib import Path

from risk_engine.export_openapi import main


def test_writes_a_stable_schema_containing_the_batch_endpoint(tmp_path: Path) -> None:
    output = tmp_path / "openapi.json"

    assert main([str(output)]) == 0

    first = output.read_text()
    assert "/v1/risk-scores:batch" in json.loads(first)["paths"]
    main([str(output)])
    assert output.read_text() == first


def test_requires_exactly_one_output_path() -> None:
    assert main([]) == 2
