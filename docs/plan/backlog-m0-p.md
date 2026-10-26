# Backlog: M0 and P

Each item maps one to one to a GitHub Issue: the title becomes the issue title, **Labels** and **Milestone** carry over, and the story plus acceptance criteria form the body. Estimates are in hours of focused work.

Labels: `module:*` (backend modules, `risk-engine`, `frontend`, `infra`, `ci`, `docs`), `type:feature | chore | test | docs`, `prio:must | should`.

---

## M0 · Walking skeleton (week 1)

### M0-01 Repository and governance
**Labels:** `infra`, `type:chore`, `prio:must` · **Estimate:** 2 h · **Depends on:** none

As the maintainer, I want the repository set up with protections and templates, so that every later change follows the same quality bar.

**Local part (done):**
- [x] Git repository initialized on `main`, with the existing docs as the first commit. `_docs/` is confirmed ignored.
- [x] A proprietary, evaluation-only `LICENSE` and `.github/SECURITY.md` (private vulnerability reporting).
- [x] Issue forms (feature, bug), a PR template with the Definition of Done checklist, and labels defined in `.github/labels.yml` with `scripts/sync-labels.sh`.
- [x] `.editorconfig`, plus `.gitattributes` normalizing line endings to LF.

**GitHub part (deferred until the gh CLI is authenticated):**
- [x] Public GitHub repository created and `main` pushed.
- [x] `main` protected with a ruleset: PRs only, required checks (filled in by M0-06), linear history, no force-push.
- [x] Private vulnerability reporting enabled. Labels synced.
- [x] GitHub Projects board with columns Backlog / Ready / In progress / Review / Done, milestones M0, P, M1, M2, M3, and this backlog imported as issues.

### M0-02 Backend skeleton (Django)
**Labels:** `module:backend`, `type:chore`, `prio:must` · **Estimate:** 4 h · **Depends on:** M0-01

As a developer, I want a running Django project in the agreed structure, so that modules can be added without restructuring.

- [x] `backend/` with uv, Python 3.13, Django 5.2 LTS, DRF and drf-spectacular. The lockfile is committed.
- [x] Layout `src/config/` and `src/grc/<module>/`, with the six empty modules and their layer folders. import-linter contracts enforce the boundaries.
- [x] Settings come from environment variables via pydantic-settings, and startup fails with a clear message if a required variable is missing. `.env.example` is provided.
- [x] Pooler-safe database settings: `ATOMIC_REQUESTS`, `DISABLE_SERVER_SIDE_CURSORS`, `CONN_MAX_AGE = 0`.
- [x] `/health/live` and `/health/ready` (the latter checks the database).
- [x] Structured JSON logging to stdout, with a request ID and `traceparent` taken from the incoming request or generated.
- [x] Middleware sets `Cache-Control: private, no-store` on every `/api` response, with an allow-list for public paths.
- [x] Multi-stage Dockerfile: slim base, non-root user, gunicorn with threads, healthcheck.
- [x] pytest-django, Ruff (including `S` rules), mypy (strict for `src/grc`), and a first test for the health endpoints and the cache header.

### M0-03 Risk-engine skeleton (FastAPI)
**Labels:** `module:risk-engine`, `type:chore`, `prio:must` · **Estimate:** 2 h · **Depends on:** M0-01

As a developer, I want the stateless risk engine running with its final contract shape, so that Django's generated client can be wired early.

- [x] `services/risk-engine/` with uv, Python 3.13 and FastAPI. Layout: `routers/`, `domain/`, `schemas/`.
- [x] `POST /v1/risk-scores:batch` with the agreed request/response schemas, including `method_version`. The domain function implements the residual-rating rule with unit tests: full and half effect, floor at the lowest level.
- [x] `/health/live` and `/health/ready`, plus the same JSON logging, request ID and `traceparent` propagation as Django.
- [x] `/docs` and `/redoc` are disabled when `ENV=production`, and the OpenAPI JSON is exported to a file by `python -m risk_engine.export_openapi` (wired into CI in M0-06).
- [x] Multi-stage Dockerfile, non-root, uvicorn.

### M0-04 Frontend skeleton
**Labels:** `module:frontend`, `type:chore`, `prio:must` · **Estimate:** 3 h · **Depends on:** M0-01

As a developer, I want the SPA foundation with routing, i18n and theming hooks, so that prototype screens can be built directly on it.

- [x] `frontend/` with pnpm, Vite, React 19, TypeScript (strict), Ant Design 6, React Router, TanStack Query and Motion. The lockfile is committed.
- [x] Feature-folder layout (`features/*`, `shared/ui`, `shared/api`) and route skeleton `/t/:tenantSlug/…`.
- [x] i18next with German as the default and English, plus a language switch. A check fails the build on missing keys.
- [x] Self-hosted Inter (no external requests) and Lucide icons.
- [x] MSW is wired for development and tests, and switched off through an environment flag.
- [x] A start page that shows the system status from `GET /api/v1/status` (mocked for now; the real endpoint comes with M0-09).
- [x] ESLint (with a rule against raw hex colors outside the token files), `tsc --noEmit`, and Vitest with Testing Library.

### M0-05 Local development and production-like compose
**Labels:** `infra`, `type:chore`, `prio:must` · **Estimate:** 2 h · **Depends on:** M0-02, M0-03, M0-04

As a developer, I want one command to run everything locally, and a production-like setup that proves portability.

- [x] `docker compose up` starts Postgres, Django, the risk engine and the Vite dev server, with hot reload.
- [x] A production-like stack (`compose.prod.yaml`, a separate file rather than a profile, so neither stack starts parts of the other) runs nginx (serving the built SPA, proxying `/api` with the same headers as Vercel), Django, the risk engine, Postgres and SeaweedFS as the S3 store.
- [x] Postgres has two roles from the start: an owner for migrations, and an app role without table ownership or BYPASSRLS.
- [x] A README section "Run locally" covers the steps, the env vars and the R2 dev bucket.

### M0-06 CI pipeline
**Labels:** `ci`, `type:chore`, `prio:must` · **Estimate:** 3 h · **Depends on:** M0-02, M0-03, M0-04

As a maintainer, I want every PR checked automatically, so that `main` stays releasable.

- [x] Workflows with path filters per part (backend, risk engine, frontend, infra, docs).
- [x] Backend and risk engine: Ruff, mypy, pytest against a Postgres service container with a coverage gate at 80 %, and import-linter.
- [x] Frontend: ESLint, `tsc`, Vitest with the coverage gate, and a production build.
- [x] Docker builds for all three images, with Trivy scanning each, plus a production-like stack run (`compose.prod.yaml`, waiting until all services are healthy).
- [x] Security and licensing: osv-scanner, gitleaks, CodeQL, a license check against the allowed list (fails on GPL/AGPL/SSPL/BUSL/non-commercial), and Dependabot configured.
- [x] Workflows use least-privilege `permissions`, actions pinned to commit SHAs, and concurrency groups that cancel superseded runs.
- [x] One aggregating job, "CI passed", is registered as the required check on `main`.

### M0-07 Infrastructure as code
**Labels:** `infra`, `type:chore`, `prio:must` · **Estimate:** 4 h · **Depends on:** M0-01

As a maintainer, I want the cloud setup reproducible from code, so that it can be rebuilt, reviewed and moved.

- [x] `infra/` with OpenTofu (MPL-2.0) for GCP and Cloudflare:
  - Artifact Registry.
  - Two Cloud Run services in `europe-west3` (min 0 / max 1). Only Django's service account may invoke the risk engine.
  - The migration Job and the demo-reset Job.
  - Cloud Scheduler entries for the drain and the reset.
  - Secret Manager secrets.
  - Workload Identity Federation for this repository only.
  - A €1 budget alert.
  - An R2 bucket under EU jurisdiction (private, CORS limited to the app origin), plus the `grc.inomov.online` DNS record (DNS only).
- [x] State is stored remotely, in a GCS bucket with versioning (configured; the bucket is created once by hand).
- [x] Supabase (`eu-central-1`, Data API off, the two roles) and Vercel (project, domain, Git integration off) are set up by hand, following a documented checklist in `infra/README.md`.
- [x] CI runs `tofu fmt`, `validate`, TFLint and Trivy's configuration scan on infra changes.
- [ ] `tofu plan` against the real project runs in CI (needs the cloud accounts and Workload Identity Federation). `apply` is done by hand.
- [ ] First `tofu apply` against the demo project (needs the cloud accounts).

### M0-08 CD pipeline
**Labels:** `ci`, `infra`, `type:chore`, `prio:must` · **Estimate:** 3 h · **Depends on:** M0-06, M0-07

As a maintainer, I want merges to `main` deployed automatically in a safe order.

- [ ] On `main`, in this order:
  1. Build and push the images, tagged with the commit SHA.
  2. Run the migration Job.
  3. Deploy the risk engine, then Django, each with no traffic until its smoke check passes, then shift traffic.
  4. Deploy production to Vercel with the CLI.
- [ ] On PRs, a Vercel preview build is deployed against the demo API, and its URL is commented on the PR.
- [ ] `vercel.json` rewrites `/api/*` to Cloud Run, sets `x-vercel-enable-rewrite-caching: 0`, and sends the security headers (CSP, HSTS, `frame-ancestors`, `nosniff`, `Referrer-Policy`).
- [ ] GitHub authenticates to GCP through Workload Identity Federation only. No long-lived keys exist anywhere.

### M0-09 End-to-end walking skeleton
**Labels:** `module:backend`, `module:frontend`, `type:test`, `prio:must` · **Estimate:** 2 h · **Depends on:** M0-08

As the maintainer, I want proof that a request passes through every layer of the demo environment.

- [ ] `GET /api/v1/status` (public, no tenant data) reports the checks, and `grc.inomov.online` shows them with one green check per hop: Vercel → Django → database (through the pooler) → risk engine (IAM call) → R2 (presigned PUT and GET of a small object).
- [ ] A check confirms that a transaction-local `set_config` survives within the transaction and is gone after it, through Supavisor.
- [ ] Playwright is set up. One E2E test runs the status page. The **cache test** checks that two clients with different sessions requesting the same `/api` URL get different responses.
- [ ] Request ID and `traceparent` appear in both services' logs for the same request.

### M0-10 AI workflow and security baseline docs
**Labels:** `docs`, `ci`, `type:docs`, `prio:should` · **Estimate:** 1.5 h · **Depends on:** M0-01

As a reviewer, I want to see how AI is used and how security is reasoned about, from day one.

- [x] A script generates `AGENTS.md`, `.github/copilot-instructions.md` and `.cursor/rules/project.mdc` from `CLAUDE.md`, and CI fails if they're out of date.
- [x] An AI review step on PRs posts its findings as review comments, and it never blocks on its own.
- [x] `docs/ai-log.md` is started with its format and a first M0 entry.
- [x] `docs/security/threat-model.md` v0 covers the public demo, uploads, tenant isolation, LLM cost, credential brute-forcing and the Vercel cache, each with a mitigation and a test reference. The CSP `unsafe-inline` exception for styles is documented there.

**M0 total:** about 26.5 h.

---

## P · Prototype (weeks 2–4)

All P screens run on MSW mock data from `seed/`, work at desktop, tablet and 390 px, are fully editable, and respect reduced motion. The deployed build shows a "Prototyp – Demodaten" badge.

### P-01 Design system and app shell
**Labels:** `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 6 h · **Depends on:** M0-04

As a user, I want a consistent, polished interface on every device, so that the product feels professional everywhere.

- [x] Tokens in three layers (primitive → semantic → antd `ConfigProvider`) for Saar Green, Blue and High Contrast, each with light and dark. Dark values are tuned by hand.
- [x] A unit test checks WCAG AA contrast for every semantic text/background pair in all six combinations.
- [x] Motion tokens. `AnimatedIcon` with presets: refresh, bell, check, chevron, plus, trash, upload, and more as needed. Presets run on hover (pointer devices only) and press, and are off with reduced motion.
- [x] App shell:
  - Sidebar on desktop, a bottom tab bar plus "More" sheet on phones.
  - Header with Tenant switcher, DE/EN switch and user menu (light/dark/system).
  - The mode is applied before first paint.
- [x] Reusable responsive patterns:
  - Column drill-down on wide screens that becomes stacked screens on phones.
  - Drawer on wide screens that becomes a bottom sheet on phones.
  - Table on wide screens that becomes a card list with swipe actions on phones.
  - Layout-shaped skeletons.
  - An error boundary.
- [x] 44 px minimum tap targets and a visible focus ring in every Theme.
- [x] Every route sets a page title, and focus moves to the main heading after navigation.
- [x] Test code is type-checked in its own tsconfig, so test globals aren't visible to app code.
- [x] The raw-color lint rule also covers template literals and CSS named colors.

### P-02 Demo fixtures and mock API
**Labels:** `module:frontend`, `module:demo`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** P-01

As a developer, I want realistic data behind a mock API shaped like the real one, so that M1 can swap mocks for real endpoints one at a time.

- [x] `seed/` JSON fixtures:
  - Muster-Stadtwerke Saar GmbH, with Wasserwerk Nord and Süd (planned Registrations), Assets and dependencies.
  - KRITIS-DachG and BSIG 2025 Requirements, with German statute text and English summaries.
  - The 7 Platform Mappings, Implementations, Evidence, Hazards, Risks with Treatments, Activity Log entries and Mapping Suggestions.
  - All fictional, no personal data.
- [x] MSW handlers follow the agreed API: tenant in the path, snake_case, Problem Details errors, `{items, page}` lists, `ETag`/`If-Match` with a simulated 412, and `Idempotency-Key`.
- [x] Typed API layer in `shared/api` used by every screen. No screen calls `fetch` directly.
- [x] A dev-only toggle simulates latency and failures, to exercise skeletons, error states and rollback.

### P-03 Login with demo role picker
**Labels:** `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 1 h · **Depends on:** P-02

- [x] Email/password form (mocked), plus two clear buttons: "Als GRC-Manager ansehen" and "Als Auditor ansehen".
- [x] The Auditor session hides or disables every write action across the app.

### P-04 Dashboard
**Labels:** `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** P-02

As a GRC Manager, I want to see where I stand at a glance.

- [x] Six widgets:
  1. Compliance per Framework and Critical Facility, with the bar fill and count-up animation.
  2. Deadline countdowns, marked as projected.
  3. Residual risk matrix.
  4. Top 5 risks.
  5. My open Implementations.
  6. Recent activity.
- [x] Each widget loads, errors and empties independently, with its own error boundary.
- [x] Phone layout stacks the widgets in priority order.

### P-05 Compliance cockpit
**Labels:** `module:frontend`, `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** P-02

As a GRC Manager, I want to drill from a paragraph to a single Implementation without losing my place.

- [x] Framework and Critical Facility selectors. Columns run paragraph → Requirement → Implementation, each with a status badge and counts, and slide in on drill-down.
- [x] Requirements show their legal citation, and a "Pending Legal Detail" marker where applicable.
- [x] Arrow-key navigation between and within columns. On phones the columns become stacked screens with a back gesture.

### P-06 Implementation drawer
**Labels:** `module:frontend`, `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** P-05

As a GRC Manager, I want to update an Implementation and prove it.

- [x] Status change with an optimistic update. A simulated 412 shows the conflict dialog and visibly rolls back.
- [x] Evidence tab:
  - File upload (mock presign flow, 20 MB and type limits, upload progress).
  - Link Evidence.
  - Reference Evidence, with a suggested NIS2 Implementation via a full Mapping (one click).
- [x] History tab showing field-level changes.
- [x] A bottom sheet on phones, draggable between half and full height.

### P-07 Risk explorer
**Labels:** `module:frontend`, `module:risk`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** P-02

As a GRC Manager, I want to see how my measures change the risk picture.

- [x] 4×4 matrix (Inherent / Residual / Target toggle), plus a risk table with filters.
- [x] Risk detail: Hazard, affected Assets, Treatments with their effects, and the explanation list.
- [x] **Signature moment:** when an Implementation linked by a Treatment becomes "implemented", the risk glides to its new matrix cell. Shows "Berechnung ausstehend" in the simulated failure mode.
- [x] Phones: compact matrix, and tapping a cell opens its risks in a sheet.

### P-08 Mapping-suggestion review
**Labels:** `module:frontend`, `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 2 h · **Depends on:** P-02

- [x] A list of suggestions showing source → target, coverage, rationale and confidence.
- [x] Approve or reject. On approval the item moves into the accepted list. Phones use swipe actions.

### P-09 Applicability Check
**Labels:** `module:frontend`, `type:feature`, `prio:should` · **Estimate:** 2 h · **Depends on:** P-02

- [x] Wizard: Sector → Critical Service → threshold value. The result is explained with the legal citation.
- [x] A positive result creates a Critical Facility with a planned Registration and shows its projected deadlines.

### P-10 Command palette
**Labels:** `module:frontend`, `type:feature`, `prio:should` · **Estimate:** 1.5 h · **Depends on:** P-02

- [x] Ctrl/Cmd+K, or the header search on phones. Searches Requirements (by citation or text), Risks, Assets and pages, navigable with the keyboard.

### P-11 Approvals inbox
**Labels:** `module:frontend`, `type:feature`, `prio:should` · **Estimate:** 1.5 h · **Depends on:** P-02

- [x] Lists everything waiting for my approval (Mapping Suggestions, Risk Assessments), with approve/reject and a badge count in the shell.

### P-12 Deadlines timeline
**Labels:** `module:frontend`, `type:feature`, `prio:should` · **Estimate:** 2 h · **Depends on:** P-02

- [x] All legal deadlines per Critical Facility on one timeline, with projected and confirmed deadlines shown differently and the legal basis on each item. On phones it's a vertical list.

### P-13 Asset dependency graph
**Labels:** `module:frontend`, `module:assets`, `type:feature`, `prio:should` · **Estimate:** 3 h · **Depends on:** P-02

- [x] Built with React Flow (`@xyflow/react`, MIT), styled with the semantic tokens. Critical Facility → Assets → suppliers as an interactive graph, with a risk overlay and a details panel. On phones, a simplified list with a tree view.

### P-14 Coverage heatmap
**Labels:** `module:frontend`, `module:compliance`, `type:feature`, `prio:should` · **Estimate:** 2 h · **Depends on:** P-02

- [x] A KRITIS-DachG × BSIG grid showing Mappings (full/partial) and where one Implementation counts for both. Tapping a cell lists the details.

### P-15 Standard screens
**Labels:** `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** P-02

- [x] Facilities and Assets lists, the Activity Log (cursor-style infinite list with filters), Tenant settings (Theme picker) and a roadmap page.

### P-16 Quality pass and prototype release
**Labels:** `module:frontend`, `type:test`, `prio:must` · **Estimate:** 3 h · **Depends on:** P-03 to P-15

- [x] Playwright runs the v1 flow end to end on mocks. axe passes on the five main screens. A reduced-motion check runs.
- [x] 30 visual baselines: 5 main screens × (Saar Green light, Saar Green dark, High Contrast light) × (desktop, 390 px).
- [ ] Lighthouse on the dashboard: performance and accessibility ≥ 90 on desktop.
- [ ] Deployed to `grc.inomov.online` with the "Prototyp – Demodaten" badge. The README links the live prototype and gives a short tour.

**P total:** about 47 h.
