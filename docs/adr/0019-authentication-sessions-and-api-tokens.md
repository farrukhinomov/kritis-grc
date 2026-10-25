---
status: accepted
date: 2026-10-25
---

# Browsers use allauth sessions; programs use API Tokens

Browser login uses django-allauth in headless mode: email and password with Argon2 hashing, an HttpOnly session cookie with CSRF protection (made possible by the single origin, ADR 0003), optional TOTP MFA, and built-in rate limiting. Auth endpoints are not hand-written, and the same library provides OIDC/SAML SSO later. Programs, including "try it" on the Scalar page at `/api/ui`, authenticate with API Tokens sent as `Authorization: Bearer`. Each API Token belongs to one Membership, is read-only or read-write, expires, is stored only as a hash, and can be revoked. CSRF does not apply to token requests.

allauth offers no personal API tokens, and django-rest-knox (the established token package) ties tokens to a user rather than a Membership, with no scope or name. API Tokens are therefore our own small model following knox's design: only a hash is stored, a short visible prefix is used for lookup, the full token is shown once, and it has an expiry. On top of that come the Membership, read/read-write scope and a name.

## Consequences

- The password-less demo login works only for the Demo Tenant and is turned off by an environment switch. Demo accounts cannot change password, email or MFA.
- Django admin lives at `/api/_admin/`, for Platform Admins only, with TOTP mandatory.
