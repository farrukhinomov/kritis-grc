---
status: accepted
date: 2026-10-24
---

# The frontend reaches the API through Vercel rewrites

Vercel rewrites `/api/*` to the Django Cloud Run service, so the browser only ever talks to a single origin. Because there is no cross-site request, HttpOnly session cookies and Django's CSRF protection work as designed, and no CORS configuration is needed. The alternative was letting the browser call `*.run.app` directly, which would require CORS plus either cross-site cookies or JWTs readable from JavaScript.

## Consequences

- Every API request makes one extra hop through Vercel's edge.
- Do not "simplify" by pointing the frontend at the Cloud Run URL. Session auth relies on the single origin.
- Since April 2026 Vercel caches external-rewrite responses by default when the upstream sends caching headers, which could serve one Tenant's data to another user. Django therefore sends `Cache-Control: private, no-store` on every `/api` response (except deliberately public ones such as the OpenAPI schema and Scalar assets), the Vercel config sets `x-vercel-enable-rewrite-caching: 0`, and an E2E test checks that two users requesting the same URL get different responses.
- Vercel's Hobby plan is for non-commercial use only, which covers the job-demo phase. For a commercial launch, either upgrade to Vercel Pro or move the static SPA to Cloudflare Pages, with a Worker forwarding `/api/*` to Cloud Run (DNS is already on Cloudflare). The single-origin rule stays the same in both cases.
