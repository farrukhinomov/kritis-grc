"""Adds the API's error answers to every operation of the OpenAPI schema.

Every error is RFC 9457 Problem Details with a stable `code`; describing that once here
keeps the reference complete without repeating it on every view.
"""

from typing import Any

PROBLEM = {
    "type": "object",
    "description": "RFC 9457 Problem Details. Branch on `code`; `detail` is for people.",
    "properties": {
        "type": {"type": "string", "example": "about:blank"},
        "title": {"type": "string", "example": "Unprocessable Content"},
        "status": {"type": "integer", "example": 422},
        "detail": {"type": "string", "example": "The request has invalid fields."},
        "code": {"type": "string", "example": "validation_error"},
        "errors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field": {"type": "string", "example": "title"},
                    "code": {"type": "string", "example": "required"},
                },
            },
        },
    },
    "required": ["type", "title", "status", "detail", "code"],
}

_ERRORS = {
    "400": "Bad filter, paging or header",
    "401": "Not signed in, or the API Token is invalid",
    "403": "The role or the API Token doesn't allow this",
    "404": "Not found, or not a member of this Tenant",
    "422": "Invalid fields, listed by name and code",
}


def add_problem_responses(result: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    result.setdefault("components", {}).setdefault("schemas", {})["Problem"] = PROBLEM
    reference = {"application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}}
    for operations in result.get("paths", {}).values():
        for operation in operations.values():
            responses = operation.setdefault("responses", {})
            for code, description in _ERRORS.items():
                responses.setdefault(code, {"description": description, "content": reference})
    return result
