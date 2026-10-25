---
status: accepted
date: 2026-10-25
---

# Postgres Row-Level Security is a second layer of tenant isolation

Tenant isolation in the application (ADR 0006, ADR 0020) can fail through a forgotten filter or a raw query. Every tenant-owned table, including Activity Log event tables, therefore also has an RLS policy that only allows rows whose `tenant_id` matches the transaction-local setting `app.tenant_id`. Requests run with `ATOMIC_REQUESTS`, and the Tenant is set with `set_config('app.tenant_id', …, true)` at the start of each transaction. Being transaction-local, it works under Supavisor transaction pooling (ADR 0004) and cannot leak to the next client on a pooled connection.

The wiring is our own: a small middleware sets the Tenant inside the request transaction, and a helper does the same for outbox handlers and Jobs. The policies are explicit SQL in Django migrations (`RunSQL`). We rejected django-rls: it is young and lightly adopted, and its docs don't say whether it sets context transaction-locally. A session-wide `SET` would leak between clients on a pooled connection.

## Consequences

- RLS fails closed: if `app.tenant_id` is not set, no tenant rows are visible.
- Django connects as a role that does not own the tables and has no BYPASSRLS, and tables use `FORCE ROW LEVEL SECURITY`. Migrations run as the owner role over a direct connection.
- Outbox handlers and the demo reset set `app.tenant_id` from the event or job inside their own transaction. Nothing tenant-related runs outside a transaction.
- The authorization test matrix (ADR 0020) includes a check that bypassing the application filter with raw SQL still returns no other Tenant's rows.
