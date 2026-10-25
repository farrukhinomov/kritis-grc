# Conventions

The agreed rules for building, running and changing this project. Decisions large enough to need a rationale live in [ADRs](adr/README.md). This file holds everything else that was agreed. If you want to break a rule here, change the rule first, in the same PR.

Terms follow [GLOSSARY.md](../GLOSSARY.md). Identifiers are English, and the UI is German first.

## Repository

- Monorepo:
  - `backend/` (Django)
  - `services/risk-engine/` (FastAPI)
  - `frontend/` (React)
  - `seed/` (demo fixtures)
  - `docs/`
- GitHub Actions workflows use path filters, so each part builds and deploys only when it changes. Workflows declare least-privilege `permissions`, pin actions to commit SHAs, and cancel superseded runs.
- Work is tracked as GitHub Issues: user stories with acceptance criteria, labelled by module, on a GitHub Projects board. One PR per issue, linked to it.
- `_docs/` holds private third-party reference material and is never committed.
- Our own code is proprietary (evaluation-only license). Dependencies follow [ADR 0016](adr/0016-permissive-licenses-only.md).

## Code comments

This applies to all source code, tests, migrations, Dockerfiles and CI/CD workflows.

- Comments explain **why**, in their own words. Where code follows a non-obvious decision, the comment summarizes the decision and its reason right there. Example: "Transaction-local so the setting can't leak to the next client on a pooled connection."
- Never reference documentation from code: no ADR numbers, no paths to Markdown files, no links to repo docs. The code has to make sense on its own, and docs can move or be superseded without leaving stale pointers behind.
- Module and service docstrings give a short summary of the module's responsibility and the key rules it enforces.
- Don't comment on what the code obviously does. Keep comments current: a comment that no longer matches the code is a bug.

## Backend (Django)

- Python 3.13, **uv** with a committed lockfile, **Django 5.2 LTS**. Upgrade to 6.2 LTS after April 2027.
- Layout: `backend/src/grc/<module>/{api,services,selectors,models,events,tests}/` and `backend/src/config/`. The modules are listed in [ADR 0010](adr/0010-modular-monolith-plus-one-service.md). Technical plumbing shared by all modules (request IDs, logging, cache headers, health probes) lives in `grc/core`, which must never import a business module.
- The project is deployed, not packaged: `src/` goes on the Python path (`pythonpath` in pytest, `PYTHONPATH` in the image and for import-linter).
- Configuration comes only from environment variables, validated at startup with **pydantic-settings**. A missing secret stops the process.
- Runs synchronously under gunicorn with threads. Static files (admin, Scalar) are served by WhiteNoise.
- Business logic never lives in views or serializers. Services receive the acting user and Membership ([ADR 0020](adr/0020-authorization-in-the-service-layer.md)).
- `ATOMIC_REQUESTS = True`. Under the pooler: `DISABLE_SERVER_SIDE_CURSORS = True`, `CONN_MAX_AGE = 0` and psycopg `prepare_threshold = None` ([ADR 0004](adr/0004-supavisor-transaction-pooling.md)). Production requires TLS to the database (`sslmode=require`).
- `APP_ENV` is required, with no default. Production also requires `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS`.
- Logs never contain query strings or the serialized request object.
- Optimistic concurrency: every editable resource has a `version`, exposed as `ETag`. Writes send `If-Match`, and a stale version returns `412 Precondition Failed`.
- Idempotency: create endpoints accept `Idempotency-Key`. Keys are stored per (Tenant, user, key) together with the original response, replayed on retry, and expire after 24 h.
- Health: `/health/live` (process up) and `/health/ready` (database reachable), wired to the platform's probes. They are answered by middleware ahead of host validation, the HTTPS redirect and the per-request transaction, so probes by IP work and a database outage returns a clean 503.
- Containers: multi-stage build, base images pinned by digest, a non-root user that can't write to the code, gunicorn with `gthread` workers, and a `HEALTHCHECK`.

## Risk engine (FastAPI)

- Layout: `routers/` (HTTP only), `domain/` (pure functions, no I/O), `schemas/`.
- No database. It can only be called by Django's service account (IAM). `/docs` is turned off in production.
- `POST /v1/risk-scores:batch` takes Risks with their Inherent Rating and Treatments. It returns the Residual Rating, category and explanations, plus `method_version` ([ADR 0014](adr/0014-qualitative-versioned-risk-method.md)).
- Django's client is generated from FastAPI's OpenAPI with datamodel-code-generator. CI fails if the generated client is out of date.
- Django calls it with a sync httpx client:
  - Timeouts: 2 s connect, 10 s read.
  - Retries with exponential backoff and jitter, for idempotent calls only.
  - A circuit breaker.
- If a risk recalculation fails, the Risk shows "calculation pending" and the outbox retries it.

## Domain events and outbox

See [ADR 0011](adr/0011-transactional-outbox-in-postgres.md).

- Envelope: `event_id`, `type`, `schema_version`, `occurred_at`, `tenant_id`, `actor_id`, `aggregate_type`, `aggregate_id`, `payload`.
- The payload is a Pydantic model carrying IDs and the changed facts. Schemas change additively only; a breaking change gets a new `schema_version`.
- Events are named in the past tense. Initial events:
  - `compliance`: `ImplementationStatusChanged`, `EvidenceAttached`, `EvidenceRemoved`, `MappingSuggested`, `MappingApproved`, `MappingRejected`.
  - `assets`: `AssetCriticalityChanged`, `AssetDependencyChanged`.
  - `risk`: `RiskScoreChanged`.
- `docs/events.md` is generated from the schemas in CI.
- Delivery:
  - First attempt right after commit (`transaction.on_commit`).
  - After that, an authenticated `/internal/outbox/drain` endpoint is called every minute.
  - Each handler gets its own delivery row: 8 attempts with exponential backoff, then `dead`. Dead deliveries are visible in admin with a retry button.
- Handlers are idempotent and re-read current state. They never rely on event order.

## API

See [ADR 0017](adr/0017-http-standard-responses-no-envelope.md), [ADR 0018](adr/0018-tenant-in-url-path.md) and [ADR 0019](adr/0019-authentication-sessions-and-api-tokens.md).

- OpenAPI is generated by **drf-spectacular** at `/api/v1/schema`. The frontend client is generated by openapi-typescript/orval, and CI fails if it's out of date. **oasdiff** blocks breaking changes.
- Lists: page + limit with total, max 100. The Activity Log uses cursor pagination. Filtering via **django-filter**, e.g. `?status=implemented&scope=…&ordering=-updated_at`.
- Every `/api` response sends `Cache-Control: private, no-store`, except the public schema and Scalar assets ([ADR 0003](adr/0003-same-origin-api-via-vercel-rewrites.md)).
- The API reference is **Scalar**, self-hosted by Django at `/api/ui`. It's public to read; "try it" uses an API Token. Internal endpoints (outbox drain, demo login, admin) are excluded from the public schema.
- Rate limits (DRF throttling): login, write endpoints, API Tokens and LLM calls. Token responses carry `RateLimit-*` headers.
- Retiring endpoints send `Deprecation` and `Sunset` headers.
- Real-time: targeted polling via TanStack Query while something is pending, plus a refresh when the window regains focus. No WebSockets or SSE.

## Authentication and access

- Session idle timeout is 8 h, and the session ID is rotated on login. TOTP MFA is optional for users and mandatory for Platform Admins.
- Django admin lives at `/api/_admin/`, for Platform Admins only.
- Demo login: `POST /api/v1/auth/demo-login {role}`. It works only for the Demo Tenant, is rate-limited, and is disabled by an environment switch. Demo accounts can't change their password, email or MFA.
- Permission sets: Auditor has `view`; GRC Manager has `view`, `change` and `approve`. In v1 one GRC Manager approves alone; requiring a second approver (four-eyes) is planned per Tenant.

## Frontend

- pnpm with a committed lockfile. Vite, React 19, TypeScript in strict mode, **Ant Design 6**, React Router. Routes live under `/t/{tenant_slug}/…`.
- Feature folders mirror the backend modules (`features/compliance`, `features/risk`, …), plus `shared/ui` and `shared/api`.
- Server state: TanStack Query. UI-only state: local state or Zustand. No Redux. Each route is code-split.
- An error boundary per route and per dashboard widget. Skeletons shaped like the final layout, never full-page spinners. Optimistic updates with a visible rollback on error.
- i18n with i18next: German by default, English as the alternative. Every string is translated. The German UI uses "Sie" in a factual tone, with written empty and error states. Requirement texts are shown in German, with an English summary when the UI is in English.
- Theming follows [ADR 0015](adr/0015-tenant-themes-and-semantic-tokens.md). Components use semantic tokens only. The Theme comes with the session, and the light/dark mode is applied before first paint.
- Motion:
  - Calm and purposeful: orientation, feedback, continuity.
  - Tokens: `duration.fast` 120 ms, `base` 200 ms, `slow` 320 ms, and `ease.standard/enter/exit`.
  - **Motion** is the only library besides antd's built-in motion.
  - Signature moments: the risk gliding across the matrix, the compliance bar filling, the cockpit columns sliding, an accepted suggestion moving into place.
  - `prefers-reduced-motion` turns non-essential motion off.
- Icons: **Lucide**, wrapped in `AnimatedIcon` with a preset per meaning. Presets run on hover (pointer devices only) and on press, in all buttons.
- Fonts: self-hosted **Inter**. No external font or CDN requests.
- No chart library in v1. The matrix, bars and rings are custom components using the tokens. The one exception is the Asset dependency graph, which uses **React Flow** (`@xyflow/react`, MIT) for graph layout and interaction, styled with the tokens.
- Every screen is usable and editable on every device:
  - Cockpit columns become stacked screens on phones.
  - The drawer becomes a bottom sheet.
  - Tables become card lists with swipe actions.
  - The sidebar becomes a bottom tab bar with a "More" sheet.
  - Tap targets are at least 44 px.
- Accessibility: WCAG 2.2 AA and full keyboard navigation (arrow keys in the cockpit), with a visible focus ring in every Theme.

## AI

- Mapping Suggestions use **Claude Sonnet 5.5** (`claude-sonnet-5-5`) with structured output and a daily call cap. Only public requirement text is sent ([ADR 0007](adr/0007-llm-sees-only-public-requirement-text.md)).
- Each call sends one KRITIS-DachG Requirement and all BSIG Requirements as candidates. Results are validated: citations not in the candidate list are discarded, and only full/partial become suggestions.
- Evaluation: a gold set built from the Platform Mappings plus known non-overlaps. Precision and recall are measured per coverage level. It runs on prompt changes, not on every PR, and the latest results go in the README.
- Development with AI:
  - [CLAUDE.md](../CLAUDE.md) is the source of truth. `.cursorrules` and `.github/copilot-instructions.md` are generated from it.
  - Every PR gets an AI review step.
  - `docs/ai-log.md` records, per milestone, what the AI proposed, what was accepted and what was rejected, and why.

## Testing and CI

Every check below is required before merging into `main`.

- Python: Ruff (including the security rules `S`), mypy, and pytest against a Postgres service container with **≥ 80 % coverage**. import-linter enforces module boundaries.
- Frontend: ESLint, `tsc --noEmit`, Vitest.
- Both Docker images build.
- Contract tests against FastAPI's OpenAPI (Schemathesis).
- Failure-mode tests (risk engine down → "calculation pending") and outbox retry tests.
- The authorization matrix (every endpoint × every actor) and the RLS raw-SQL check.
- Playwright E2E for 3–4 core flows, including the two-user cache test, axe checks on the main screens, a reduced-motion check, and **30 visual baselines**: 5 main screens × (Saar Green light, Saar Green dark, High Contrast light) × (desktop, 390 px).
- Security and licensing:
  - Scanners: osv-scanner, Trivy (images), gitleaks, CodeQL (while the repo is public), Dependabot. High/critical findings block merges.
  - A license check enforces ADR 0016.

## Infrastructure and deployment

- **Environments:** local (`docker compose`, Postgres, R2 dev bucket) and one public demo. Vercel preview builds use the demo API.
- **Cloud Run:**
  - Region `europe-west3`.
  - Two services, `min-instances 0` and `max-instances 1`. Per-instance concurrency equals gunicorn workers x threads (8 for Django).
  - Images go to Artifact Registry. GitHub Actions authenticates with Workload Identity Federation, with no stored keys. Secrets live in Secret Manager.
  - Migrations run as a Cloud Run Job before traffic switches to the new revision.
- **Cloud Scheduler:** the nightly Demo Tenant reset (a Job that also wipes the Tenant's R2 objects), and the every-minute outbox drain. This also keeps Supabase from pausing.
- **Supabase:** `eu-central-1`, with the Data API switched off. Runtime uses the pooler on port 6543; migrations use a direct connection.
- **Vercel:**
  - The app runs at `grc.inomov.online` (Cloudflare DNS, CNAME set to DNS only).
  - `/api/*` is rewritten to Cloud Run, with `x-vercel-enable-rewrite-caching: 0`.
  - Vercel's Git integration is off. GitHub Actions deploys with the Vercel CLI: previews on PRs, production only after the backend deploy succeeds.
- **Cloudflare R2:** EU jurisdiction, private, no `r2.dev` URL, with a bucket-scoped token. CORS allows only the app origin.
  - Uploads use presigned PUT URLs (about 5 min). Limits: 20 MB; PDF, PNG, JPG, DOCX, XLSX. Both are checked when the URL is issued and again on confirm.
  - Downloads use signed URLs with `Content-Disposition: attachment`.
- **Cost guard:** a €1 budget alert (it only notifies), max one instance per service, and the LLM daily cap.
- **Observability:** JSON logs on stdout. Request ID and `traceparent` pass from Vercel → Django → FastAPI.
- **Infrastructure as code:** OpenTofu (MPL-2.0) in `infra/` for GCP and Cloudflare, with remote state in a versioned GCS bucket. `plan` runs in CI; `apply` is done by hand. Supabase and Vercel are set up from a documented checklist.
- **Portability:** a production-like compose setup (nginx, SeaweedFS) runs in CI ([ADR 0021](adr/0021-portable-to-sovereign-hosting.md)).

## Security and privacy

- `docs/security/threat-model.md` (STRIDE-lite) lists threats, mitigations and the test that proves each mitigation.
- Headers:
  - CSP `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (needed by antd's CSS-in-JS; documented in the threat model), `frame-ancestors 'none'`.
  - HSTS, `nosniff`, `Referrer-Policy`, and Django's secure cookie settings.
- Demo data is fictional and contains no personal data. The upload form asks people not to upload personal data. Visitor uploads are wiped every night.
- An Impressum (§ 5 DDG) and a privacy policy are live from M1.

## Demo

- Demo Tenant: "Muster-Stadtwerke Saar GmbH" (sector Wasser), with Critical Facilities "Wasserwerk Nord" and "Wasserwerk Süd", both with a planned Registration.
- Two demo logins: GRC Manager and Auditor, both shown on the login page. The Saar Green Theme is the default.
- All demo content lives in `seed/` as JSON fixtures. MSW serves them in the prototype, and the Django seed command loads the same files.

## Presentation

- README structure:
  1. Pitch: why KRITIS-DachG, and why now.
  2. Live demo link and logins.
  3. GIF.
  4. Architecture.
  5. Key decisions.
  6. AI workflow and eval results.
  7. `docker compose up`.
  8. Badges.
- Diagrams in Mermaid: C4 context and container, plus the event-flow sequence.
- A 3-minute demo video with German narration and English subtitles.
- Interview notes stay private, outside the repo.
