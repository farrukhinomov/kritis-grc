---
status: accepted
date: 2026-10-25
---

# The Tenant is part of every URL

Tenant-owned endpoints live under `/api/v1/tenants/{tenant_slug}/…`, and frontend routes under `/t/{tenant_slug}/…`. We rejected keeping an "active Tenant" in the session: that hidden state breaks when two browser tabs use different Tenants, makes links unshareable, and gives API Tokens no way to say which Tenant they act on.

## Consequences

- The Membership is resolved from the URL's Tenant on every request. Without a Membership the answer is 404, not 403, so other Tenants' existence is never revealed.
