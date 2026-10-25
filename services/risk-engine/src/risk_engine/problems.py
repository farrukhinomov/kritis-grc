"""Errors as RFC 9457 Problem Details, the same shape the public API uses.

Clients branch on the stable `code`; field errors name the field and the kind of
problem but never echo the rejected input.
"""

import logging
from collections.abc import Mapping
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)

MEDIA_TYPE = "application/problem+json"
_CODES = {
    HTTPStatus.NOT_FOUND: "not_found",
    HTTPStatus.METHOD_NOT_ALLOWED: "method_not_allowed",
}


def problem(
    status: HTTPStatus,
    code: str,
    detail: str,
    headers: Mapping[str, str] | None = None,
    **extra: Any,
) -> JSONResponse:
    body = {
        "type": "about:blank",
        "title": status.phrase,
        "status": status.value,
        "detail": detail,
        "code": code,
        **extra,
    }
    return JSONResponse(body, status_code=status.value, media_type=MEDIA_TYPE, headers=headers)


def internal_error() -> JSONResponse:
    return problem(
        HTTPStatus.INTERNAL_SERVER_ERROR, "internal_error", "An unexpected error occurred."
    )


async def _validation_failed(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, RequestValidationError):  # pragma: no cover - registration guard
        raise error
    errors = [{"field": _field(issue), "code": issue["type"]} for issue in error.errors()]
    return problem(
        HTTPStatus.UNPROCESSABLE_CONTENT,
        "validation_failed",
        "The request does not match the expected schema.",
        errors=errors,
    )


async def _http_error(request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, HTTPException):  # pragma: no cover - registration guard
        raise error
    status = HTTPStatus(error.status_code)
    # Headers such as `Allow` on 405 are part of the HTTP contract and must survive.
    return problem(
        status, _CODES.get(status, "http_error"), status.description, headers=error.headers
    )


async def _unexpected(request: Request, error: Exception) -> JSONResponse:
    # Last line of defense for errors raised outside the request middleware.
    logger.exception("Unhandled error")
    return internal_error()


def _field(issue: Mapping[str, Any]) -> str:
    # A body that isn't valid JSON has no field; its location only holds a byte offset.
    if issue["type"] == "json_invalid":
        return ""
    # The first location element is "body"/"query"; the rest is the field path.
    return ".".join(str(part) for part in issue["loc"][1:])


def install(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, _validation_failed)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(Exception, _unexpected)
