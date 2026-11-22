import re
from http import HTTPStatus
from typing import Any

import pytest
from django.test import Client
from drf_spectacular.generators import SchemaGenerator


def _schema() -> dict[str, Any]:
    schema: dict[str, Any] = SchemaGenerator().get_schema(request=None, public=True)  # type: ignore[no-untyped-call]
    return schema


def _operations() -> list[tuple[str, str, dict[str, Any]]]:
    return [
        (method, path, operation)
        for path, operations in _schema()["paths"].items()
        for method, operation in operations.items()
    ]


def test_the_reference_page_is_public_and_loads_nothing_from_elsewhere(client: Client) -> None:
    # No database marker: the page must not need one.
    response = client.get("/api/ui")

    page = response.content.decode()
    assert response.status_code == HTTPStatus.OK
    assert "no-store" not in response.get("Cache-Control", "")
    assert 'data-url="/api/v1/schema"' in page
    assert "/api/static/scalar/standalone.js" in page
    assert re.findall(r"https?://", page) == []
    assert "<script>" not in page  # no inline script: the CSP allows only files
    assert "&quot;telemetry&quot;: false" in page


def test_every_operation_is_summarized() -> None:
    missing = [f"{m.upper()} {p}" for m, p, op in _operations() if not op.get("summary")]

    assert missing == []


def test_every_operation_documents_its_problem_answers() -> None:
    for _, _, operation in _operations():
        problem = operation["responses"]["401"]["content"]["application/problem+json"]
        assert problem["schema"] == {"$ref": "#/components/schemas/Problem"}


def test_api_tokens_are_offered_as_bearer_authentication() -> None:
    schemes = _schema()["components"]["securitySchemes"]

    assert schemes["apiToken"]["scheme"] == "bearer"


@pytest.mark.django_db
def test_the_schema_is_served(client: Client) -> None:
    response = client.get("/api/v1/schema")

    assert response.status_code == HTTPStatus.OK
    assert b"Problem" in response.content
