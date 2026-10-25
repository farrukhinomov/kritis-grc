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

- Layout: `routers/` (HTTP only), `domain/` (pure functions, no I/O), `schemas/`. Runs on uvicorn via `python -m risk_engine`, with plain ASGI middleware for request context (not `BaseHTTPMiddleware`). Tests use Starlette's TestClient with `httpx2`.
- Errors are RFC 9457 Problem Details, like the public API.
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

- pnpm with a committed lockfile. Vite, React 19, TypeScript in strict mode, **Ant Design 6**, React Router.
- Tool versions held back on purpose: TypeScript 6.0 until typescript-eslint supports 7, and ESLint 9 until eslint-plugin-jsx-a11y supports 10.
- Mocks: MSW, shared by the prototype and the tests. Tests fail on any request without a mock (`onUnhandledFrame: "error"`).
  - The mock API serves `seed/` and behaves like the real one: routes under `/api/v1/tenants/{slug}/…`, Problem Details with field errors, `{items, page}` lists capped at 100, 401 without a session, 404 for Tenants without a Membership, 403 when the role lacks the permission, `If-Match` (428 when missing, 412 when stale), `Idempotency-Key` replay, and an Activity Log entry for every write. Calculated values (deadlines, Residual Rating, the compliance summary) are derived on read.
  - A contract test drives it through the typed API functions, so the screens and the future backend share one specification.
  - In development, a simulation panel adds latency, failures, a 412 conflict or an unreachable risk engine. Production builds don't contain it.
- Sign-in: pages under `/t/…` sit behind a session gate that sends visitors to `/login` and back afterwards (only to paths under `/t/`). Login and logout clear the whole query cache, and a 401 from any request drops the session. The prototype refuses every password login; the two demo logins are the way in.
- Write controls ask `useCan("change")` or `useCan("approve")` for the current Membership and are hidden or disabled when it says no, and the shell shows a read-only badge. This is presentation only: the API refuses the write anyway, and the mock answers 403 like the backend.
- HTTP lives only in `shared/api`: typed resource functions plus TanStack `queryOptions` with Tenant-first query keys. A lint rule rejects `fetch` anywhere else.
- Pages and the Tenant shell are lazy-loaded per route. React gets its own long-cached vendor chunk; Ant Design is split by usage, so a screen downloads only the components it renders. Motion loads its animation features after the first render (`LazyMotion` with `m.*` components; a full `motion.*` component fails at runtime). Initial JavaScript stays below 300 KB gzipped. Routes live under `/t/{tenant_slug}/…`.
- Feature folders mirror the backend modules (`features/compliance`, `features/risk`, …), plus `shared/ui` and `shared/api`.
- Server state: TanStack Query. UI-only state: local state or Zustand. No Redux. Each route is code-split.
- Dashboard and cockpit numbers come from server-side aggregates (`/compliance-summary`, `/compliance-paragraphs`, `/risk-matrix`, `?ordering=-residual_score`, `?owner=…&status=open,partial`), never from paging through whole lists. Aggregates are plain objects, not pages, so no row can be cut off; names a reader needs (actor, owner, Scope, Framework, a risk's Hazard and Assets) are embedded. A write to an Implementation must invalidate the Tenant's `implementations` and `risks` queries, because the Residual Rating follows Implementation statuses. The compliance percentage counts only implemented work against the applicable Implementations; partial work is shown beside it, not counted. Risks without a Residual Rating are never shown as low.
- Drill-downs keep their place in the URL (`?framework=…&scope=…&paragraph=…&requirement=…`): every level is a history entry, so reload, shared links and the browser's or phone's back gesture all work. Defaults stay out of the URL. Drill lists have one tab stop; arrow keys move within and between columns.
- An error boundary per route and per dashboard widget. Skeletons shaped like the final layout, never full-page spinners. Optimistic updates with a visible rollback on error.
- Optimistic writes snapshot every cached copy they touch and restore all of them on error; the control stays locked until the save settles, because a second change would carry the old version. A 412 opens a dialog that says the change wasn't saved. Afterwards the Implementation, risk and Activity Log queries are refetched.
- An Idempotency-Key belongs to one payload: an exact retry after a lost response reuses it, so no second record appears; any change to the payload, or a success, starts a new key.
- The open drawer and its tab are part of the URL (`&panel=status|evidence|history`): opening adds a history entry, so the phone's back gesture closes the sheet; switching tabs replaces it.
- The risk explorer keeps its view in the URL (`?rating=…&scope=…&category=…&cell=3-4&page=…&risk=…`): filters replace the history entry, opening a risk's detail adds one, so the back gesture closes it. The risk list and `/risk-matrix` take the rating to read (`rating=inherent|residual|target`, default residual), a category and a cell (`likelihood` + `impact`). `category=pending` exists only for the Residual Rating, because the Inherent and Target Ratings are set by people and never wait for a calculation.
- i18n with i18next: German by default, English as the alternative. Every string is translated. German ships in the first download (default, fallback and the typed source of every key); every other language, together with its Ant Design locale, loads when first chosen, and rendering waits for the remembered language so it never flashes German. The German UI uses "Sie" in a factual tone, with written empty and error states. Requirement texts are shown in German, with an English summary when the UI is in English.
- Theming follows [ADR 0015](adr/0015-tenant-themes-and-semantic-tokens.md). Components use semantic tokens only. The Theme comes with the session, and the light/dark mode is applied before first paint.
- Motion:
  - Calm and purposeful: orientation, feedback, continuity.
  - Tokens: `duration.fast` 120 ms, `base` 200 ms, `slow` 320 ms, and `ease.standard/enter/exit`.
  - **Motion** is the only library besides antd's built-in motion.
  - Signature moments: the risk gliding across the matrix, the compliance bar filling, the cockpit columns sliding, an accepted suggestion moving into place.
  - `prefers-reduced-motion` turns non-essential motion off.
- Icons: **Lucide**, wrapped in `AnimatedIcon` with a preset per meaning. Presets run on hover (pointer devices only) and on press, in all buttons. The animations are CSS keyframes, so they cost no re-renders and stop under reduced motion without JavaScript.
- Styles: antd components take the Theme through `ConfigProvider`. Everything else uses the semantic tokens as CSS variables (`var(--grc-surface)`) in plain style sheets whose classes carry a `grc-` prefix. Raw colors exist only in `shared/theme/primitives.ts`.
- Fonts: self-hosted **Inter**. No external font or CDN requests.
- No chart library in v1. The matrix, bars and rings are custom components using the tokens. The one exception is the Asset dependency graph, which uses **React Flow** (`@xyflow/react`, MIT) for graph layout and interaction, styled with the tokens.
- Every screen is usable and editable on every device:
  - Cockpit columns become stacked screens on phones.
  - The drawer becomes a bottom sheet.
  - Tables become card lists with swipe actions.
  - A table wider than its box scrolls inside it and never widens the page.
  - The sidebar becomes a bottom tab bar with a "More" sheet.
  - Tap targets are at least 44 px.
- Accessibility: WCAG 2.2 AA and full keyboard navigation (arrow keys in the cockpit), with a visible focus ring in every Theme.

## AI

- Mapping Suggestions use **Claude Sonnet 5.5** (`claude-sonnet-5-5`) with structured output and a daily call cap. Only public requirement text is sent ([ADR 0007](adr/0007-llm-sees-only-public-requirement-text.md)).
- Each call sends one KRITIS-DachG Requirement and all BSIG Requirements as candidates. Results are validated: citations not in the candidate list are discarded, and only full/partial become suggestions.
- Evaluation: a gold set built from the Platform Mappings plus known non-overlaps. Precision and recall are measured per coverage level. It runs on prompt changes, not on every PR, and the latest results go in the README.
- Development with AI:
  - [CLAUDE.md](../CLAUDE.md) is the source of truth. `AGENTS.md`, `.github/copilot-instructions.md` and `.cursor/rules/project.mdc` (Cursor's current format, replacing the deprecated `.cursorrules`) are generated from it.
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
  - Scanners: osv-scanner (lockfiles), Trivy (images), gitleaks (full git history), CodeQL with `security-extended` (while the repo is public), Dependabot with a 7-day cooldown. High/critical fixable findings block merges.
  - Scanners run as digest-pinned containers, not through third-party actions. Actions are pinned to commit SHAs, workflows have `permissions: {}` by default, and checkout never persists credentials. `actionlint` and `zizmor` check the workflows themselves.
  - A license check enforces ADR 0016 against `.github/license-policy.json` for runtime dependencies only.
  - Runtime images ship without pip and get OS security patches at build time.
- Path filters skip unaffected parts. A single aggregating job, "CI passed", is the required check, so skipped jobs count as passed and failed ones never do.

## Infrastructure and deployment

- **Environments:** local (`docker compose`, Postgres, R2 dev bucket) and one public demo. Vercel preview builds use the demo API.
- **Compose:** `compose.yaml` for development (mounted sources, hot reload) and `compose.prod.yaml` for a production-like run (the real images in production mode, nginx in front with the same headers as the edge, Postgres with TLS, SeaweedFS). Images are pinned by digest, ports bind to `127.0.0.1` only, and required secrets come from a git-ignored `.env`.
- **Database roles:** an owner role runs migrations and owns every table. The app role connects at runtime with data access only: no table ownership, no `CREATE`, no `BYPASSRLS`. Hosted databases get the same split.
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
  - Uploads use presigned PUT URLs (about 5 min) with `Content-Type` and `Content-Length` signed in, good for one PUT. Limits: 20 MB; PDF, PNG, JPG, DOCX, XLSX. Both are checked when the URL is issued and again on confirm, where the stored file's first bytes must match the announced type. The browser uploads with XMLHttpRequest, as fetch can't report upload progress; the limits live once in `shared/api` for the UI's early check and the mock's checks.
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
