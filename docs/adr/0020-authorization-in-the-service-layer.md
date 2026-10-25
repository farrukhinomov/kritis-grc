---
status: accepted
date: 2026-10-25
---

# Authorization is checked in the service layer

Roles map to permission sets in code: Auditor has `view`; GRC Manager has `view`, `change` and `approve`. Every service receives the acting user and Membership and checks the permission itself. The queryset layer automatically limits all data to the Membership's Tenant and, if set, its Scopes. Checking only in views would let any other entry point (outbox handlers, API Tokens, a future CLI) bypass authorization.

## Consequences

- A test matrix runs every endpoint in the OpenAPI against every kind of actor (anonymous, Auditor, GRC Manager, a member of another Tenant, a Scope-limited GRC Manager) and compares the results with an expected status table. An endpoint missing from the table fails CI.
