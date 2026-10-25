# CLAUDE.md

Instructions for AI coding assistants working in this repository. `.cursorrules` and `.github/copilot-instructions.md` are generated from this file, so don't edit them by hand.

## Project

A multi-tenant GRC SaaS for KRITIS-Dachgesetz compliance with mapping to NIS2 (BSIG 2025). Django/DRF modular monolith, one stateless FastAPI risk engine, a React 19 + TypeScript + Ant Design 6 SPA, and PostgreSQL. **Status: M0 in progress.** The backend skeleton exists; keep the commands below current.

## Read before changing anything

1. [GLOSSARY.md](GLOSSARY.md): use these terms exactly, in code, UI and docs. Never use the words listed under *Avoid*.
2. [docs/adr/README.md](docs/adr/README.md): decisions and why they were made. Don't silently contradict an ADR.
3. [docs/conventions.md](docs/conventions.md): the day-to-day rules.
4. [docs/scope.md](docs/scope.md): what is in v1 and what isn't. Don't build features from the out-of-scope list.

## Commands

Backend (run in `backend/`, details in [backend/README.md](backend/README.md)):

```bash
uv run pytest                        # tests, coverage ≥ 80 % enforced
uv run ruff check . && uv run ruff format --check .
uv run mypy src manage.py            # strict; needs the variables from backend/.env
PYTHONPATH=src uv run lint-imports   # module and layer boundaries
```

_Frontend and `docker compose` commands follow with M0-04 and M0-05._

## Non-negotiable rules

- **Tenant isolation:**
  - Every tenant-owned model has `tenant_id`, the enforcing manager and an RLS policy ([ADR 0006](docs/adr/0006-shared-schema-tenant-isolation.md), [ADR 0022](docs/adr/0022-postgres-rls-defense-in-depth.md)).
  - Never query tenant data outside a transaction with `app.tenant_id` set.
  - Never use raw SQL without a tenant filter.
- **Authorization lives in services**, which receive the actor. Never check permissions only in a view ([ADR 0020](docs/adr/0020-authorization-in-the-service-layer.md)).
- **Business logic** goes in `services/` (writes) and `selectors/` (reads), never in views or serializers. Modules talk only through each other's services/selectors and domain events ([ADR 0010](docs/adr/0010-modular-monolith-plus-one-service.md)).
- **Django owns the database.** The FastAPI service never connects to Postgres ([ADR 0001](docs/adr/0001-django-owns-all-data-fastapi-is-stateless.md)).
- **Side effects across modules go through outbox events**, and handlers are idempotent ([ADR 0011](docs/adr/0011-transactional-outbox-in-postgres.md)).
- **The Activity Log is immutable.** Never update or delete its rows. Only the demo reset may purge ([ADR 0009](docs/adr/0009-activity-log-immutable-in-database.md)).
- **The LLM only receives public requirement text**, never tenant data ([ADR 0007](docs/adr/0007-llm-sees-only-public-requirement-text.md)).
- **API responses** follow RFC 9457 for errors, have no envelope, use snake_case, and change v1 additively only ([ADR 0017](docs/adr/0017-http-standard-responses-no-envelope.md)). Never drop `Cache-Control: no-store` from `/api` ([ADR 0003](docs/adr/0003-same-origin-api-via-vercel-rewrites.md)).
- **Pooler settings:** don't raise `CONN_MAX_AGE` and don't enable server-side cursors ([ADR 0004](docs/adr/0004-supavisor-transaction-pooling.md)).
- **No cloud-vendor SDKs** outside adapter modules ([ADR 0021](docs/adr/0021-portable-to-sovereign-hosting.md)). No logging SDKs: log JSON to stdout ([ADR 0008](docs/adr/0008-logs-on-stdout-activity-log-in-postgres.md)).
- **Dependencies:** only permissive licenses. Never add GPL, AGPL, SSPL, BUSL or non-commercial packages ([ADR 0016](docs/adr/0016-permissive-licenses-only.md)).
- **Frontend:**
  - Semantic tokens only, no raw hex colors ([ADR 0015](docs/adr/0015-tenant-themes-and-semantic-tokens.md)).
  - Every UI string goes through i18n. The German UI uses "Sie".
  - Respect `prefers-reduced-motion`.
- **Secrets:** never hardcode them. Configuration comes from environment variables validated at startup. Never commit `_docs/`, `.env` or credentials.

## Code comments

- Code, tests, migrations, Dockerfiles and CI/CD workflows **never reference documentation**: no ADR numbers, no `.md` paths, no links to repo docs.
- Where code follows a non-obvious decision, write the decision and its reason **in the comment itself**, briefly and in your own words.
- Comments explain why, not what. Module and service docstrings summarize responsibilities and the rules they enforce.

## How to work

- **Tests come first** for new behavior. Coverage must stay ≥ 80 %. Every bug fix gets a regression test.
- **One issue, one PR.** Keep PRs small and link the issue.
- **When a term is resolved or changes,** update [GLOSSARY.md](GLOSSARY.md) in the same PR. The glossary contains no implementation details.
- **When a decision is hard to reverse, surprising, and the result of a trade-off,** add an ADR from [docs/adr/template.md](docs/adr/template.md). Once code depends on an ADR, supersede it with a new one; don't rewrite it.
- **Smaller rule changes** go into [docs/conventions.md](docs/conventions.md) in the same PR as the code.
- **Before you finish,** run the checks, and say what you couldn't verify.
- **Record significant AI suggestions you rejected,** and why, in `docs/ai-log.md`.
