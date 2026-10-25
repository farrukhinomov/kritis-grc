---
status: accepted
date: 2026-10-25
---

# API responses follow HTTP standards, not a custom envelope

The general coding rules ask for one envelope on every response (`success`, `data`, `error`, `meta`). This API deliberately doesn't use it. It's a public REST API used by Scalar, client generators and outside integrators, and they all expect the HTTP conventions:

- Successful responses return the resource directly. The HTTP status code already says whether the request succeeded.
- Errors use RFC 9457 Problem Details (`application/problem+json`) with a stable machine-readable `code` and a field-level `errors` list. The frontend translates by `code`, so German/English never leaks into the API.
- Every list has the same shape: `{ "items": [...], "page": {...} }`. Normal lists use page + limit with a total (max 100). The Activity Log uses cursor pagination.

JSON is snake_case end to end. The API lives under `/api/v1/` and changes only additively. Breaking changes go to `/api/v2`, retiring endpoints send `Deprecation`/`Sunset` headers, and oasdiff in CI fails any PR that breaks v1.

## Consequences

- Do not add a `success` flag or wrap responses in `data`. Clients rely on status codes and Problem Details.
