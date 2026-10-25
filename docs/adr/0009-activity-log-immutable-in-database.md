---
status: accepted
date: 2026-10-25
---

# The Activity Log is recorded by triggers and made unchangeable in the database

The Activity Log is built on django-pghistory. It records changes to tracked models with Postgres triggers, so every write is captured, including `QuerySet.update()`, bulk operations and raw SQL. Middleware and services attach the acting user and Membership as pghistory context, which is set transaction-locally and so works under Supavisor transaction pooling (ADR 0004). pghistory also provides the field-level diffs the UI shows. We rejected Django signals, which miss bulk updates and don't know the acting user, and hand-written log calls in every service, which can be forgotten.

Immutability is not left to application code. Our own trigger on pghistory's event tables always rejects `UPDATE`, and rejects `DELETE` unless the current transaction has run `SET LOCAL app.allow_activity_purge = 'on'`. Only the nightly Demo Tenant reset Job sets that flag. `SET LOCAL` lasts a single transaction, so the escape hatch cannot leak into other requests.

## Consequences

- Event tables carry `tenant_id` and are covered by RLS like every other tenant table (ADR 0022).
- An M1 test against Supavisor confirms that the user context arrives through the pooler. Another test checks that the trigger rejects `UPDATE`/`DELETE`.
- Deleting a real (non-demo) Tenant would need its own deliberate decision. The purge flag is not a general-purpose delete switch.
