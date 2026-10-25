import json
import logging
from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from risk_engine.log_setup import RequestContextFilter, logging_config
from risk_engine.main import create_app
from risk_engine.settings import ConfigurationError, Environment, Settings, load_settings


def test_missing_configuration_names_the_variable_but_not_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("PORT", "not-a-port-secret-ish")

    with pytest.raises(ConfigurationError) as excinfo:
        load_settings()

    message = str(excinfo.value)
    assert "APP_ENV (missing)" in message
    assert "PORT (invalid)" in message
    assert "secret-ish" not in message


def test_valid_configuration_loads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")

    assert load_settings().is_production


def test_unexpected_errors_become_a_generic_problem_without_internals() -> None:
    app = create_app(Settings(app_env=Environment.TEST))

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("database password is hunter2")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/boom")

    assert response.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
    assert response.json()["code"] == "internal_error"
    assert "hunter2" not in response.text
    assert response.headers["X-Request-ID"]


def test_unexpected_errors_are_logged_with_the_request_context(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_app(Settings(app_env=Environment.TEST))

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaputt")

    client = TestClient(app, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR):
        client.get("/boom", headers={"X-Request-ID": "req-500"})

    [record] = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert vars(record)["request_id"] == "req-500"


def test_log_records_outside_a_request_get_placeholder_ids() -> None:
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)

    RequestContextFilter().filter(record)

    assert vars(record)["request_id"] == "-"
    assert vars(record)["trace_id"] == "-"


def test_logging_config_writes_json_with_the_requested_level() -> None:
    config = logging_config("WARNING")

    assert config["root"]["level"] == "WARNING"
    assert config["handlers"]["stdout"]["formatter"] == "json"
    json.dumps({k: v for k, v in config.items() if k != "filters"})
