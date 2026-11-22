"""Errors as RFC 9457 Problem Details with a stable `code`.

The UI branches on `code` and translates it itself, so the `detail` text is for people
reading logs and the API reference, never shown to users. Field errors carry the field
name and a code, not a sentence.
"""

from http import HTTPStatus
from typing import Any

from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

PROBLEM_CONTENT_TYPE = "application/problem+json"

# DRF and Django name a few equivalent field problems differently; the UI knows one.
_FIELD_CODES = {"blank": "required", "null": "required", "max_length": "too_long"}


class Problem(exceptions.APIException):
    """An error a service raises on purpose, with the status and code the client sees."""

    def __init__(self, status_code: int, code: str, detail: str) -> None:
        super().__init__(detail=detail, code=code)
        self.status_code = status_code
        self.problem_code = code


class FieldProblem(exceptions.APIException):
    """Field errors found by a service rather than by the request's serializer."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY

    def __init__(self, errors: list[dict[str, str]]) -> None:
        super().__init__(detail="The request has invalid fields.", code="validation_error")
        self.errors = errors


def problem_response(
    status_code: int, code: str, detail: str, errors: list[dict[str, str]] | None = None
) -> Response:
    body: dict[str, Any] = {
        "type": "about:blank",
        "title": HTTPStatus(status_code).phrase,
        "status": status_code,
        "detail": detail,
        "code": code,
    }
    if errors:
        body["errors"] = errors
    return Response(body, status=status_code, content_type=PROBLEM_CONTENT_TYPE)


def handle_exception(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF's exception handler, answering in Problem Details."""
    if isinstance(exc, exceptions.ValidationError):
        return problem_response(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "validation_error",
            "The request has invalid fields.",
            _field_errors(exc.get_codes()),
        )
    if isinstance(exc, exceptions.NotAuthenticated | exceptions.AuthenticationFailed):
        # The client needs 401 to tell "log in" apart from "not allowed", even where only
        # a session could authenticate and DRF would answer 403.
        unauthenticated = problem_response(
            status.HTTP_401_UNAUTHORIZED, "not_authenticated", "Authentication is required."
        )
        view = context.get("view")
        challenge = view.get_authenticate_header(context["request"]) if view else None
        if challenge:
            unauthenticated["WWW-Authenticate"] = challenge
        return unauthenticated
    if isinstance(exc, Http404 | exceptions.NotFound):
        return problem_response(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    if isinstance(exc, FieldProblem):
        return problem_response(
            exc.status_code, "validation_error", "The request has invalid fields.", exc.errors
        )
    if isinstance(exc, Problem):
        return problem_response(exc.status_code, exc.problem_code, str(exc.detail))
    response = exception_handler(exc, context)
    if response is None:
        return None
    code = exc.get_codes() if isinstance(exc, exceptions.APIException) else "http_error"
    return problem_response(
        response.status_code,
        code if isinstance(code, str) else "http_error",
        str(getattr(exc, "detail", HTTPStatus(response.status_code).phrase)),
    )


def _field_errors(codes: Any, prefix: str = "") -> list[dict[str, str]]:
    if isinstance(codes, dict):
        return [
            error
            for name, nested in codes.items()
            for error in _field_errors(
                nested, f"{prefix}{name}" if not prefix else f"{prefix}.{name}"
            )
        ]
    if isinstance(codes, list):
        return [error for nested in codes for error in _field_errors(nested, prefix)]
    return [{"field": prefix or "non_field_errors", "code": _FIELD_CODES.get(codes, codes)}]
