"""How API Tokens appear in the OpenAPI schema, so the reference can try requests with one."""

from typing import Any

from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ApiTokenScheme(OpenApiAuthenticationExtension):  # type: ignore[no-untyped-call]
    target_class = "grc.organization.authentication.ApiTokenAuthentication"
    name = "apiToken"

    def get_security_definition(self, auto_schema: Any) -> dict[str, str]:
        return {
            "type": "http",
            "scheme": "bearer",
            "description": "An API Token, created in the Tenant settings: `grc_<prefix>_<secret>`.",
        }
