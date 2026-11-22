"""Pages Django serves itself, outside the JSON API."""

import json

from django.http import HttpRequest, HttpResponse
from django.templatetags.static import static
from django.utils.html import escape

# Scalar reads its settings from attributes, so the page needs no inline script and the
# self-only Content-Security-Policy holds. Everything that would contact Scalar's own
# servers is off: telemetry (on by default), the AI agent, default fonts from a CDN and
# their developer toolbar. API Tokens are the scheme "try it" offers.
_CONFIGURATION = {
    "telemetry": False,
    "agent": {"disabled": True},
    "showDeveloperTools": "never",
    "withDefaultFonts": False,
    "hideClientButton": True,
    "authentication": {"preferredSecurityScheme": "apiToken"},
}


def api_reference(request: HttpRequest) -> HttpResponse:
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GRC Platform API</title>
</head>
<body>
<noscript>The API reference needs JavaScript. The schema is at /api/v1/schema.</noscript>
<script id="api-reference" data-url="/api/v1/schema"
  data-configuration="{escape(json.dumps(_CONFIGURATION))}"></script>
<script src="{escape(static("scalar/standalone.js"))}"></script>
</body>
</html>
"""
    return HttpResponse(page)
