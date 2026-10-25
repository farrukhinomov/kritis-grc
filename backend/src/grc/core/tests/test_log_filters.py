import logging

from django.test import RequestFactory

from grc.core.log_filters import RequestContextFilter


def _record(**extra: object) -> logging.LogRecord:
    record = logging.LogRecord("django.request", logging.WARNING, __file__, 1, "msg", None, None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_takes_ids_from_the_request_when_logged_after_the_middleware_returned() -> None:
    # Django logs 4xx/5xx responses after the middleware chain has finished.
    request = RequestFactory().get("/api/v1/nope")
    request.request_id = "req-42"  # type: ignore[attr-defined]
    request.trace_id = "a" * 32  # type: ignore[attr-defined]
    record = _record(request=request)

    RequestContextFilter().filter(record)

    assert vars(record)["request_id"] == "req-42"
    assert vars(record)["trace_id"] == "a" * 32


def test_falls_back_to_a_placeholder_outside_any_request() -> None:
    record = _record()

    RequestContextFilter().filter(record)

    assert vars(record)["request_id"] == "-"
    assert vars(record)["trace_id"] == "-"


def test_keeps_ids_that_were_passed_explicitly() -> None:
    record = _record(request_id="explicit", trace_id="b" * 32)

    RequestContextFilter().filter(record)

    assert vars(record)["request_id"] == "explicit"


def test_drops_the_request_object_so_query_strings_never_reach_the_logs() -> None:
    request = RequestFactory().get("/api/v1/nope?token=SECRET123")
    record = _record(request=request)

    RequestContextFilter().filter(record)

    assert "request" not in vars(record)
