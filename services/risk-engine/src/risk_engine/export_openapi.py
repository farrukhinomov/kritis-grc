"""Writes the OpenAPI schema to a file: `python -m risk_engine.export_openapi <path>`.

Production serves no schema, so it is exported from code instead; the API service
generates its typed client from that file.
"""

import json
import sys
from pathlib import Path
from typing import Any

from risk_engine.main import create_app
from risk_engine.settings import Environment, Settings


def openapi_schema() -> dict[str, Any]:
    return create_app(Settings(app_env=Environment.TEST)).openapi()


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        sys.stderr.write("usage: python -m risk_engine.export_openapi <output.json>\n")
        return 2
    output = Path(argv[0])
    # Sorted keys and a trailing newline keep the file stable, so diffs show real changes.
    output.write_text(json.dumps(openapi_schema(), indent=2, sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
