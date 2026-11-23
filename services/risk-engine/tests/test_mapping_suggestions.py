"""Mapping Suggestions: what goes to the model, and what is let through from it."""

from http import HTTPStatus
from types import SimpleNamespace
from typing import Any, Literal

import anthropic
import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from risk_engine.mapping.prompt import PROMPT_VERSION
from risk_engine.mapping.suggest import MODEL, ModelAnswer, ModelMatch

TARGET = {"id": "req-k-13-3-2", "citation": "§ 13 Abs. 3 Nr. 2", "text": "Zutrittskontrolle."}
CANDIDATES = [
    {"id": "req-b-30-2-9", "citation": "§ 30 Abs. 2 Nr. 9", "text": "Zugriffskontrolle."},
    {"id": "req-b-30-2-1", "citation": "§ 30 Abs. 2 Nr. 1", "text": "Risikoanalyse."},
]
BODY = {"target": TARGET, "candidates": CANDIDATES}


def _match(candidate_id: str, coverage: Literal["full", "partial"] = "partial") -> ModelMatch:
    return ModelMatch(
        candidate_id=candidate_id,
        coverage=coverage,
        confidence=0.637,
        rationale_de=" Beide verlangen Zugangskontrollen. ",
        rationale_en="Both require access control.",
    )


class FakeMessages:
    def __init__(self, answer: ModelAnswer | None, stop_reason: str = "end_turn") -> None:
        self.answer, self.stop_reason = answer, stop_reason
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(
            parsed_output=self.answer,
            stop_reason=self.stop_reason,
            model=MODEL,
            usage=SimpleNamespace(input_tokens=10, cache_read_input_tokens=900, output_tokens=50),
        )


def _with_model(client: TestClient, messages: FakeMessages) -> TestClient:
    client.app.state.anthropic = SimpleNamespace(beta=SimpleNamespace(messages=messages))  # type: ignore[attr-defined]
    return client


def _generate(client: TestClient) -> Any:
    return client.post("/v1/mapping-suggestions:generate", json=BODY)


def test_only_offered_candidates_with_coverage_become_suggestions(client: TestClient) -> None:
    answer = ModelAnswer(
        matches=[_match("req-b-30-2-9"), _match("req-b-99"), _match("req-b-30-2-9", "full")]
    )
    response = _generate(_with_model(client, FakeMessages(answer)))

    assert response.status_code == HTTPStatus.OK
    assert response.json() == {
        "model": MODEL,
        "prompt_version": PROMPT_VERSION,
        "suggestions": [
            {
                "source_requirement_id": "req-b-30-2-9",
                "coverage": "partial",
                "confidence": 0.64,
                "rationale_de": "Beide verlangen Zugangskontrollen.",
                "rationale_en": "Both require access control.",
            }
        ],
    }


def test_the_target_is_never_its_own_suggestion(client: TestClient) -> None:
    answer = ModelAnswer(matches=[_match(TARGET["id"])])
    body = {"target": TARGET, "candidates": [*CANDIDATES, TARGET]}

    messages = FakeMessages(answer)
    response = _with_model(client, messages).post("/v1/mapping-suggestions:generate", json=body)

    assert response.json()["suggestions"] == []


def test_the_request_holds_only_statute_text_and_caches_the_candidates(
    client: TestClient,
) -> None:
    messages = FakeMessages(ModelAnswer(matches=[]))

    _generate(_with_model(client, messages))

    call = messages.calls[0]
    assert call["model"] == "claude-sonnet-5-5"
    assert call["fallbacks"] == "default"
    candidates = call["system"][1]
    assert candidates["cache_control"] == {"type": "ephemeral"}
    sent = repr(call["system"]) + repr(call["messages"])
    for requirement in [TARGET, *CANDIDATES]:
        assert requirement["text"] in sent
    # The target varies per call, so it stays out of the cached prefix.
    assert TARGET["text"] not in repr(call["system"])


def test_extra_fields_in_the_request_are_refused(client: TestClient) -> None:
    body = {**BODY, "tenant": "muster-stadtwerke"}

    response = client.post("/v1/mapping-suggestions:generate", json=body)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_CONTENT


def test_without_an_api_key_the_endpoint_is_unavailable(client: TestClient) -> None:
    response = _generate(client)

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE
    assert response.json()["code"] == "model_unavailable"
    assert response.headers["Retry-After"] == "60"


@pytest.mark.parametrize(
    "error",
    [
        anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.test")),
        anthropic.InternalServerError(
            "overloaded",
            response=httpx.Response(529, request=httpx.Request("POST", "https://api.test")),
            body=None,
        ),
        anthropic.BadRequestError(
            "bad",
            response=httpx.Response(400, request=httpx.Request("POST", "https://api.test")),
            body=None,
        ),
    ],
)
def test_model_errors_answer_503_for_the_caller_to_retry(
    client: TestClient, error: Exception
) -> None:
    messages = FakeMessages(None)
    messages.error = error

    response = _generate(_with_model(client, messages))

    assert response.status_code == HTTPStatus.SERVICE_UNAVAILABLE


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_an_unfinished_answer_is_not_used(client: TestClient, stop_reason: str) -> None:
    messages = FakeMessages(ModelAnswer(matches=[_match("req-b-30-2-9")]), stop_reason)

    response = _generate(_with_model(client, messages))

    assert response.status_code == HTTPStatus.BAD_GATEWAY
    assert response.json()["code"] == "model_declined"


def test_a_configured_key_builds_a_client() -> None:
    from pydantic import SecretStr

    from risk_engine.main import create_app
    from risk_engine.settings import Environment, Settings

    app = create_app(Settings(app_env=Environment.TEST, anthropic_api_key=SecretStr("k")))

    assert isinstance(app.state.anthropic, anthropic.Anthropic)
