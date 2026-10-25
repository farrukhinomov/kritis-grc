---
status: accepted
date: 2026-10-24
---

# Tenants share one schema, isolated by an enforced tenant_id

All Tenants live in one Postgres schema. Every tenant-owned table has a `tenant_id` foreign key, and a default manager/queryset refuses to run without a Tenant. We rejected schema-per-tenant (`django-tenants`). It isolates more strongly, but it multiplies migrations by the number of Tenants and works poorly with Supavisor transaction pooling (ADR 0004), since `search_path` does not survive between transactions.

## Consequences

- The application layer is the first line of defense, and Postgres RLS is the second (ADR 0022). A test walks every model and fails if a tenant-owned model lacks `tenant_id`, the enforcing manager or an RLS policy.
- Raw SQL and `Model.objects.all()`-style escape hatches have to be reviewed for tenant filtering.
