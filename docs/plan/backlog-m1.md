# Backlog: M1 Compliance core

Week 5 of [scope.md](../scope.md): the real API behind steps 1–3 and 5 of the v1 flow. Same format as [backlog-m0-p.md](backlog-m0-p.md): each item maps one to one to a GitHub Issue, estimates are hours of focused work.

## Ground rules for M1

- **The prototype is the contract.** Every endpoint matches the MSW handler of the same path in `frontend/src/mocks/handlers/` (paths, query parameters, field names, status codes, Problem Details types). Where the real API must differ, the MSW handler and its contract test change in the same PR.
- **The prototype keeps working.** MSW stays available behind `VITE_API_MOCKING=enabled` for the public prototype. The compose stack runs the frontend against Django.
- **Local first.** The cloud accounts don't exist yet (M0-07 to M0-09 are blocked on them), so M1 is built and tested against the compose stack: Postgres with the owner and app roles, SeaweedFS as the S3 store. Checks that need Supavisor or R2 move to M0-09.
- **Isolation is built once, first.** M1-01 delivers the tenant-owned model base, RLS and the request transaction context. Every later model uses it and is covered by the model-walk test automatically.

## Budget

About **30 h** against 20 h for week 5: the must items alone are about 26 h. M1 therefore takes week 5 and about a third of week 6, and M2 starts late by the same amount. The `prio:should` items (M1-09, M1-10, about 4 h) come last and move behind M2 if time runs out; nothing in the v1 flow depends on them.

---

### M1-01 Tenant isolation foundation
**Labels:** `module:organization`, `module:backend`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** M0-02, M0-05

As the platform operator, I want every tenant-owned row isolated twice, in the application and in Postgres, so that a forgotten filter or a raw query can never show one Tenant's data to another.

- [ ] `Tenant`, `Scope`, `Membership` (role GRC Manager or Auditor, optional Scopes) and a `TenantOwned` abstract model with `tenant` FK and an enforcing manager that refuses to query without a Tenant.
- [ ] RLS policies in `RunSQL` migrations with `FORCE ROW LEVEL SECURITY`, matching `tenant_id` against `current_setting('app.tenant_id', true)`. Migrations run as the owner role, the app connects as the role without ownership or BYPASSRLS.
- [ ] A transaction-local tenant context: middleware for requests, a helper for jobs and later outbox handlers. Both use `set_config('app.tenant_id', …, true)` inside the transaction.
- [ ] Tests: a model walk fails if a tenant-owned model lacks `tenant_id`, the manager or a policy. Raw SQL without the application filter returns no rows of another Tenant. Without a tenant context, no tenant rows are visible.
- [ ] `GLOSSARY.md` needs no change; if a term shifts, update it in this PR.

### M1-02 Login: allauth headless and demo login
**Labels:** `module:organization`, `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-01

As a visitor, I want to log in with email and password or as a demo role, so that I see the Demo Tenant as GRC Manager or Auditor.

- [ ] django-allauth in headless mode: Argon2 hashing, HttpOnly session cookie, CSRF, built-in rate limiting. No hand-written auth endpoints.
- [ ] `POST /api/v1/auth/demo-login` with the role, only for the Demo Tenant, switched off by an environment variable. Demo accounts can't change password or email.
- [ ] `GET /api/v1/me` returns the user and their Memberships in the shape the login screen already uses. `POST /api/v1/auth/logout`.
- [ ] The frontend login screen works against Django in the compose stack; the MSW auth handlers stay for the prototype.
- [ ] Tests: wrong password is rate-limited, demo login is rejected when switched off or for another Tenant, CSRF is enforced on session writes.

### M1-03 Authorization in services and the actor matrix
**Labels:** `module:organization`, `module:backend`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-02

As a GRC Manager, I want every action checked against my Membership wherever it is called from, so that no entry point can bypass my role or Scopes.

- [ ] The Membership is resolved from `/api/v1/tenants/{tenant_slug}/…` on every request. No Membership answers 404, never 403.
- [ ] Roles map to permissions in code (Auditor `view`; GRC Manager `view`, `change`, `approve`). Every service receives the actor and checks the permission itself. Querysets narrow to the Membership's Scopes when it has any.
- [ ] A test matrix runs every OpenAPI operation against anonymous, Auditor, GRC Manager, a member of another Tenant and a Scope-limited GRC Manager, and compares with an expected status table. An operation missing from the table fails the test.

### M1-04 Frameworks, Requirements, Platform Mappings and the seed command
**Labels:** `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-01

As a GRC Manager, I want both Frameworks with their Requirements and the curated Mappings, so that the cockpit shows the real legal content.

- [ ] `Framework`, `FrameworkVersion`, `Requirement` (citation, verbatim German text, English summary, Pending Legal Detail) and `Mapping` (platform or tenant, full or partial, gap note). Platform rows are not tenant-owned; Tenant Mappings are.
- [ ] `manage.py seed_demo` loads `seed/*.json` idempotently: the same fixtures MSW serves. Running it twice changes nothing.
- [ ] Endpoints: `frameworks`, `requirements`, `requirements/:id`, `mappings`, `compliance-paragraphs`, with the filters the cockpit uses.
- [ ] The cockpit runs against Django in the compose stack.

### M1-05 Scopes and Critical Facilities
**Labels:** `module:organization`, `type:feature`, `prio:must` · **Estimate:** 2 h · **Depends on:** M1-03

As a GRC Manager, I want my Scopes and Critical Facilities with their planned Registration, so that requirements and deadlines attach to the right facility.

- [ ] Critical Facility as a kind of Scope with Sector, Critical Service and a planned or confirmed Registration date.
- [ ] Endpoints: `scopes`, `scopes/:id`, `POST scopes` (GRC Manager only), `critical-services`.
- [ ] The two demo facilities come from the seed.

### M1-06 Implementations with status changes
**Labels:** `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-04, M1-05

As a GRC Manager, I want to change an Implementation's status safely, so that two people editing at once can't overwrite each other.

- [ ] `Implementation` (Requirement × Scope, status open / partial / implemented / not applicable), created by the seed for every Requirement in each demo Scope.
- [ ] `implementations`, `implementations/:id`, `PATCH implementations/:id` with `ETag`/`If-Match` (412 on a stale version) and `Idempotency-Key`.
- [ ] `compliance-summary`: (implemented + 0.5 × partial) / (all − not applicable) per Framework and Scope.
- [ ] The Implementation drawer's status change, conflict dialog and rollback work against Django.

### M1-07 Evidence: Link, Reference and File
**Labels:** `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** M1-06

As a GRC Manager, I want to attach a document, a link or a reference to another Implementation, so that one piece of work counts as proof for several Frameworks.

- [ ] Evidence of kind File, Link or Reference. A Reference must point to an Implementation in the same Scope.
- [ ] Files go through a storage adapter that speaks the S3 API: SeaweedFS locally, R2 later, with no vendor SDK outside the adapter. `POST uploads` returns a presigned PUT, limited in size and content type; the file key is scoped by Tenant.
- [ ] `implementations/:id/evidence` list, create and delete.
- [ ] Step 3 of the v1 flow works in the compose stack.

### M1-08 Activity Log
**Labels:** `module:activity`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-06, M1-07

As an Auditor, I want to see who changed what, when and from which value to which, so that I can trust the compliance data.

- [ ] django-pghistory on Implementation, Evidence, Scope and Tenant Mapping. The acting user and Membership are attached as context in the request transaction.
- [ ] Event tables carry `tenant_id` and an RLS policy. Our own trigger rejects every `UPDATE`, and `DELETE` unless `app.allow_activity_purge` is on for that transaction.
- [ ] `GET activity` with cursor pagination and the filters the Activity Log screen uses.
- [ ] Tests: the trigger rejects `UPDATE` and `DELETE`, the context reaches the event row, a `QuerySet.update()` is recorded.
- [ ] Step 5 of the v1 flow works in the compose stack.

### M1-09 API Tokens
**Labels:** `module:organization`, `type:feature`, `prio:should` · **Estimate:** 2.5 h · **Depends on:** M1-03

As an integrator, I want a read-only or read-write token for one Membership, so that a program can use the API without my password.

- [ ] Own model following knox's design: only a hash is stored, a short visible prefix for lookup, the full token is shown once, an expiry, a name and the scope.
- [ ] `Authorization: Bearer` authentication. A read-only token gets 403 on writes. A token never has more rights than its Membership, and revoking the Membership revokes its tokens.
- [ ] Create, list and revoke endpoints. The actor matrix covers token actors.

### M1-10 API reference at /api/ui
**Labels:** `module:backend`, `type:feature`, `prio:should` · **Estimate:** 1.5 h · **Depends on:** M1-09

As an integrator, I want an interactive API reference, so that I can try the API with my token.

- [ ] Scalar at `/api/ui` serving the drf-spectacular schema, assets self-hosted (no external requests), "try it" with Bearer tokens.
- [ ] Every operation has a summary, Problem Details error responses and examples.

### M1-11 Impressum and privacy policy
**Labels:** `module:frontend`, `type:docs`, `prio:must` · **Estimate:** 1 h · **Depends on:** none

As a visitor, I want the legally required Impressum and privacy policy, so that the public demo can process logins lawfully.

- [ ] German pages, linked from the login screen and the shell footer, with an English version.
- [ ] The privacy policy names what is processed: session cookie, login data, demo data reset nightly, hosting in the EU.
- [ ] The maintainer reviews the legal text before release; the code only renders it.

**M1 total:** about 30 h.
