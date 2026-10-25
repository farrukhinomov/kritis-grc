# Architecture Decision Records

Each ADR records one decision that is hard to reverse, would surprise a future reader, and came from a real trade-off. Smaller agreements live in [../conventions.md](../conventions.md).

## How to use them

- **New decision:** copy [template.md](template.md) to the next free number (`NNNN-short-slug.md`), set `status: proposed`, and change it to `accepted` once agreed.
- **Changed decision:** once code depends on an ADR, don't rewrite it. Write a new ADR, and set the old one to `status: superseded by ADR-NNNN`. Before any code exists, accepted ADRs may still be edited in place.
- **Language:** use the terms from [GLOSSARY.md](../../GLOSSARY.md).

## Index

| # | Decision | Status |
|---|---|---|
| **Data and services** | | |
| [0001](0001-django-owns-all-data-fastapi-is-stateless.md) | Django owns all data; the FastAPI service is stateless | accepted |
| [0010](0010-modular-monolith-plus-one-service.md) | A modular monolith plus one extracted service | accepted |
| [0011](0011-transactional-outbox-in-postgres.md) | Domain events go through a transactional outbox in Postgres | accepted |
| **Database and tenancy** | | |
| [0002](0002-supabase-as-plain-postgres.md) | Supabase is used only as managed Postgres | accepted |
| [0004](0004-supavisor-transaction-pooling.md) | Django connects through Supavisor in transaction mode | accepted |
| [0006](0006-shared-schema-tenant-isolation.md) | Tenants share one schema, isolated by an enforced tenant_id | accepted |
| [0022](0022-postgres-rls-defense-in-depth.md) | Postgres Row-Level Security is a second layer of tenant isolation | accepted |
| **API, auth and access** | | |
| [0003](0003-same-origin-api-via-vercel-rewrites.md) | The frontend reaches the API through Vercel rewrites | accepted |
| [0017](0017-http-standard-responses-no-envelope.md) | API responses follow HTTP standards, not a custom envelope | accepted |
| [0018](0018-tenant-in-url-path.md) | The Tenant is part of every URL | accepted |
| [0019](0019-authentication-sessions-and-api-tokens.md) | Browsers use allauth sessions; programs use API Tokens | accepted |
| [0020](0020-authorization-in-the-service-layer.md) | Authorization is checked in the service layer | accepted |
| **Domain** | | |
| [0012](0012-framework-versions-from-day-one.md) | Framework Versions exist from day one | accepted |
| [0013](0013-platform-and-tenant-mappings.md) | Mappings are platform-curated or tenant-owned, and never set a status | accepted |
| [0014](0014-qualitative-versioned-risk-method.md) | Risks are rated on a fixed qualitative matrix by a versioned method | accepted |
| **Audit trail and logging** | | |
| [0008](0008-logs-on-stdout-activity-log-in-postgres.md) | Operational logs go to stdout; the Activity Log lives in Postgres | accepted |
| [0009](0009-activity-log-immutable-in-database.md) | The Activity Log is recorded by triggers and made unchangeable | accepted |
| **Hosting, compliance and AI** | | |
| [0005](0005-eu-only-data-residency.md) | All data stays in the EU, Evidence files on Cloudflare R2 | accepted |
| [0007](0007-llm-sees-only-public-requirement-text.md) | The LLM only sees public requirement text | accepted |
| [0016](0016-permissive-licenses-only.md) | Only permissively licensed dependencies; the product stays commercial | accepted |
| [0021](0021-portable-to-sovereign-hosting.md) | The system runs on any container platform | accepted |
| **Frontend** | | |
| [0015](0015-tenant-themes-and-semantic-tokens.md) | Tenants choose a Theme; components use only semantic tokens | accepted |
