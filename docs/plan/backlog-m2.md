# Backlog: M2 Risk and events

Week 6 of [scope.md](../scope.md): the real API behind step 4 of the v1 flow (the Residual Rating moves and the dashboard follows) and the risk screens. Same format as [backlog-m1.md](backlog-m1.md): each item maps one to one to a GitHub Issue, estimates are hours of focused work.

## Ground rules for M2

- **The prototype is the contract**, as in M1. Every endpoint matches the MSW handler of the same path in `frontend/src/mocks/handlers/`. Where the real API must differ, the handler and its contract test change in the same PR.
- **Modules react to events, not to calls.** `compliance` never learns that `risk` recalculates after a status change ([ADR 0011](../adr/0011-transactional-outbox-in-postgres.md)). Handlers are idempotent and re-read current state.
- **The risk engine stays stateless** ([ADR 0001](../adr/0001-django-owns-all-data-fastapi-is-stateless.md)). Django sends everything a calculation needs and stores the result with its `method_version` ([ADR 0014](../adr/0014-qualitative-versioned-risk-method.md)).
- **Local first**, as in M1. Cloud Scheduler doesn't exist yet, so the compose stack drains the outbox with a worker loop; the HTTP drain endpoint and service-to-service authentication move to M0-08/M0-09.
- **Prototype-only screens stay on MSW** ([scope.md](../scope.md)): the Asset dependency graph, the approvals inbox, the coverage heatmap and the deadlines timeline are not built here.

## Budget

About **17 h** against 20 h for week 6, which absorbs the third of week 6 that M1 overran into.

---

### M2-01 Transactional outbox and domain events
**Labels:** `module:backend`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** M1-01

As the platform operator, I want modules to react to each other's changes through events written in the same transaction, so that no reaction is lost when a dependency is down.

- [ ] Tenant-owned `OutboxEvent` and one `OutboxDelivery` per subscribed handler, with RLS. Attempts, next attempt with exponential backoff, and a `dead` state after the last attempt.
- [ ] `publish(event)` inside the service transaction; a handler registry shaped like `@task`, so a later switch to `django.tasks` is mechanical.
- [ ] Delivery is first attempted right after commit. Each delivery runs in its own transaction with the Tenant's context, and a failing handler never affects the others.
- [ ] `manage.py drain_outbox` claims due deliveries with `FOR UPDATE SKIP LOCKED`, across Tenants without bypassing RLS. The compose stacks run it as a worker loop.
- [ ] Tests: an event rolled back with its transaction is never delivered, a failure is retried with backoff and ends dead, two drains never run the same delivery, a handler sees only its event's Tenant.

### M2-02 Assets and the Hazard catalogue
**Labels:** `module:assets`, `module:risk`, `type:feature`, `prio:must` · **Estimate:** 2 h · **Depends on:** M1-05

As a GRC Manager, I want the Assets of each Critical Facility and the Hazard catalogue, so that Risks name what is threatened and by what.

- [ ] `Asset` (Scope, name, kind, criticality, description, dependencies on other Assets of the Tenant, across Scopes) and `Hazard` (category natural / technical / human-made, German and English name and description), both tenant-owned.
- [ ] Endpoints `assets` (filter `scope`) and `hazards`. The seed loads both.

### M2-03 Risks and the risk matrix
**Labels:** `module:risk`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M2-02, M1-06

As a GRC Manager, I want every Risk of a Critical Facility with its ratings and Treatments, so that I see where we stand on the matrix.

- [ ] `Risk` (Scope, Hazard, Assets, title, owner, Inherent and Target Rating) and `Treatment` (Implementation, dimension, levels). The stored Residual Rating carries score, category, explanations and `method_version`, or is empty while pending.
- [ ] Endpoints `risks` (filters `scope`, `asset`, `rating`, `category`, `likelihood`, `impact`; ordering `-residual_score`, unrated last), `risks/:id`, `risk-matrix`.
- [ ] Risks are recorded in the Activity Log. The seed loads the demo Risks.

### M2-04 Residual Rating from the risk engine
**Labels:** `module:risk`, `module:backend`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M2-01, M2-03

As a GRC Manager, I want the Residual Rating to follow my Implementations, so that setting one to "implemented" visibly moves its Risk on the matrix.

- [ ] `compliance` publishes `ImplementationStatusChanged`. The `risk` handler recalculates every Risk treated by that Implementation through `POST /v1/risk-scores:batch` and stores the result.
- [ ] A risk-engine client adapter with a short timeout, the request ID passed on, and the base URL validated at startup. An unreachable engine leaves the rating pending and the delivery retried.
- [ ] The seed calculates every demo Risk once. A recalculation for an unchanged input changes nothing.
- [ ] Tests run against the real engine's OpenAPI contract, not a hand-written fake.

### M2-05 Risk Assessments with the four-eyes rule
**Labels:** `module:risk`, `type:feature`, `prio:must` · **Estimate:** 2.5 h · **Depends on:** M2-03

As a GRC Manager, I want a submitted Risk Assessment approved by someone else, so that no one signs off their own work.

- [ ] `RiskAssessment` (Scope, title, date, Risks, summary, status submitted / approved / rejected, who submitted and who decided, decision note).
- [ ] Endpoints `risk-assessments` (filters `status`, `scope`), `risk-assessments/:id/approve`, `risk-assessments/:id/reject` (note required). Deciding needs `approve`; the submitter can't decide their own.
- [ ] Decisions are recorded in the Activity Log. The seed loads both demo assessments.

### M2-06 Deadlines and the dashboard
**Labels:** `module:organization`, `module:frontend`, `type:feature`, `prio:must` · **Estimate:** 2.5 h · **Depends on:** M2-04, M2-05

As a GRC Manager, I want my legal deadlines on the dashboard, so that I see what is due first.

- [ ] `deadlines`: every Critical Facility's duties from its Registration, plus the renewal of its latest approved Risk Assessment, soonest first. Exempt sectors owe neither.
- [ ] All six dashboard widgets and step 4 of the v1 flow work against Django in the compose stack.
