import logging
import re
from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from risk_engine.main import create_app
from risk_engine.settings import Environment, Settings

URL = "/v1/risk-scores:batch"
TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
UNKNOWN_DIMENSION = {
    "implementation_id": "x",
    "dimension": "speed",
    "levels": 1,
    "implementation_status": "implemented",
}


def risk(risk_id: str = "risk-1", **overrides: object) -> dict[str, object]:
    return {
        "risk_id": risk_id,
        "inherent": {"likelihood": 4, "impact": 3},
        "treatments": [
            {
                "implementation_id": "impl-1",
                "dimension": "likelihood",
                "levels": 2,
                "implementation_status": "implemented",
            }
        ],
        **overrides,
    }


def test_scores_a_batch_and_reports_the_method_version(client: TestClient) -> None:
    response = client.post(URL, json={"risks": [risk("a"), risk("b", treatments=[])]})

    assert response.status_code == HTTPStatus.OK
    body = response.json()
    assert body["method_version"] == "qualitative-4x4/1"
    first, second = body["results"]
    assert first == {
        "risk_id": "a",
        "residual": {"likelihood": 2, "impact": 3},
        "score": 6,
        "category": "high",
        "explanations": [
            {
                "implementation_id": "impl-1",
                "dimension": "likelihood",
                "implementation_status": "implemented",
                "levels_applied": 2,
            }
        ],
    }
    assert second["residual"] == {"likelihood": 4, "impact": 3}


@pytest.mark.parametrize(
    "payload",
    [
        {"risks": []},
        {"risks": [risk(inherent={"likelihood": 5, "impact": 1})]},
        {"risks": [risk(treatments=[UNKNOWN_DIMENSION])]},
        {"risks": [risk(str(i)) for i in range(501)]},
        {"risks": [risk(unexpected="field")]},
    ],
    ids=["empty", "out-of-matrix", "unknown-dimension", "too-many", "unknown-field"],
)
def test_invalid_input_is_answered_with_problem_details(
    client: TestClient, payload: dict[str, object]
) -> None:
    response = client.post(URL, json=payload)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_CONTENT
    assert response.headers["content-type"] == "application/problem+json"
    body = response.json()
    assert body["code"] == "validation_failed"
    assert body["status"] == HTTPStatus.UNPROCESSABLE_CONTENT
    assert body["errors"]
    assert all(set(error) == {"field", "code"} for error in body["errors"])


def test_unknown_routes_are_answered_with_problem_details(client: TestClient) -> None:
    response = client.get("/nope")

    assert response.status_code == HTTPStatus.NOT_FOUND
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["code"] == "not_found"


@pytest.mark.parametrize("path", ["/health/live", "/health/ready"])
def test_probes_answer_ok(client: TestClient, path: str) -> None:
    response = client.get(path)

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {"status": "ok"}


def test_request_id_is_generated_echoed_or_replaced(client: TestClient) -> None:
    generated = client.get("/health/live").headers["X-Request-ID"]
    echoed = client.get("/health/live", headers={"X-Request-ID": "req-7"}).headers["X-Request-ID"]
    replaced = client.get("/health/live", headers={"X-Request-ID": "bad id"}).headers[
        "X-Request-ID"
    ]

    assert re.fullmatch(r"[0-9a-f]{32}", generated)
    assert echoed == "req-7"
    assert re.fullmatch(r"[0-9a-f]{32}", replaced)


def test_access_log_carries_the_callers_trace(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="risk_engine.access"):
        client.post(
            URL,
            json={"risks": [risk()]},
            headers={"X-Request-ID": "req-9", "traceparent": TRACEPARENT},
        )

    [record] = [r for r in caplog.records if r.name == "risk_engine.access"]
    fields = vars(record)
    assert fields["request_id"] == "req-9"
    assert fields["trace_id"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert fields["path"] == URL
    assert fields["status"] == HTTPStatus.OK


def test_interactive_docs_and_schema_are_closed_in_production() -> None:
    client = TestClient(create_app(Settings(app_env=Environment.PRODUCTION)))

    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == HTTPStatus.NOT_FOUND


def test_interactive_docs_are_available_outside_production(client: TestClient) -> None:
    assert client.get("/docs").status_code == HTTPStatus.OK


def test_method_not_allowed_lists_the_allowed_methods(client: TestClient) -> None:
    response = client.delete(URL)

    assert response.status_code == HTTPStatus.METHOD_NOT_ALLOWED
    assert response.headers["Allow"] == "POST"
    assert response.json()["code"] == "method_not_allowed"


def test_malformed_json_is_reported_without_a_bogus_field_name(client: TestClient) -> None:
    response = client.post(URL, content=b"{not json", headers={"Content-Type": "application/json"})

    assert response.status_code == HTTPStatus.UNPROCESSABLE_CONTENT
    assert response.json()["errors"] == [{"field": "", "code": "json_invalid"}]
