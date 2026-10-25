import logging
import re

import pytest
from django.test import Client

VALID_TRACEPARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"


def test_generates_a_request_id_when_none_is_sent(client: Client) -> None:
    response = client.get("/health/live")

    assert re.fullmatch(r"[0-9a-f]{32}", response["X-Request-ID"])


def test_echoes_a_well_formed_incoming_request_id(client: Client) -> None:
    response = client.get("/health/live", headers={"X-Request-ID": "abc-123"})

    assert response["X-Request-ID"] == "abc-123"


@pytest.mark.parametrize("bad_id", ["", "a" * 65, "has spaces", "new\nline", "<script>"])
def test_replaces_a_malformed_incoming_request_id(client: Client, bad_id: str) -> None:
    response = client.get("/health/live", headers={"X-Request-ID": bad_id})

    assert response["X-Request-ID"] != bad_id
    assert re.fullmatch(r"[0-9a-f]{32}", response["X-Request-ID"])


def test_access_log_carries_request_and_trace_ids(
    client: Client, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="grc.access"):
        client.get(
            "/health/live",
            headers={"X-Request-ID": "req-1", "traceparent": VALID_TRACEPARENT},
        )

    [record] = [r for r in caplog.records if r.name == "grc.access"]
    fields = vars(record)
    assert fields["request_id"] == "req-1"
    assert fields["trace_id"] == "4bf92f3577b34da6a3ce929d0e0e4736"
    assert fields["method"] == "GET"
    assert fields["path"] == "/health/live"
    assert fields["status"] == 200
    assert fields["duration_ms"] >= 0


def test_starts_a_new_trace_when_traceparent_is_missing_or_invalid(
    client: Client, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="grc.access"):
        client.get("/health/live", headers={"traceparent": "garbage"})

    [record] = [r for r in caplog.records if r.name == "grc.access"]
    trace_id = vars(record)["trace_id"]
    assert re.fullmatch(r"[0-9a-f]{32}", trace_id)
    assert trace_id != "0" * 32
