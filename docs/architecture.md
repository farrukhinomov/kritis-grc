# Architecture

Three diagrams: who uses the platform and what it talks to (C4 context), what runs where (C4 container), and how a status change becomes a moved Risk (event flow). The decisions behind them are in the [ADRs](adr/README.md).

## Context

```mermaid
flowchart LR
  manager["GRC Manager<br/><small>keeps compliance and risks current</small>"]
  auditor["Auditor<br/><small>reads everything, changes nothing</small>"]
  integrator["Integrator<br/><small>a program with an API Token</small>"]
  platform["GRC Platform<br/><small>KRITIS-Dachgesetz and NIS2 (BSIG) compliance<br/>for critical facilities</small>"]
  llm["Anthropic API<br/><small>Claude Sonnet 5.5</small>"]
  storage["Object storage<br/><small>S3-compatible: R2, SeaweedFS</small>"]

  manager -- "browser" --> platform
  auditor -- "browser" --> platform
  integrator -- "REST, Bearer token" --> platform
  platform -- "public statute text only" --> llm
  platform -- "Evidence files, presigned PUT" --> storage
  manager -- "uploads Evidence directly" --> storage
```

Only the text of public statutes leaves for the LLM; no Tenant, Scope or person does ([ADR 0007](adr/0007-llm-sees-only-public-requirement-text.md)). Files go from the browser straight to storage, never through the application.

## Containers

```mermaid
flowchart TB
  browser["SPA<br/><small>React 19, TypeScript, Ant Design 6</small>"]
  subgraph edge["Same origin"]
    web["Static hosting + /api rewrite<br/><small>Vercel; nginx in the compose stack</small>"]
  end
  subgraph app["Application"]
    django["API<br/><small>Django 5.2 + DRF, modular monolith:<br/>organization, compliance, assets, risk, activity, demo</small>"]
    worker["Outbox worker<br/><small>drain_outbox: retries domain events</small>"]
    engine["Risk engine<br/><small>FastAPI, stateless: Residual Ratings,<br/>Mapping Suggestions</small>"]
  end
  db[("PostgreSQL<br/><small>row-level security per Tenant,<br/>Activity Log by triggers</small>")]
  s3[("Object storage")]
  llm["Anthropic API"]

  browser --> web --> django
  django -- "owns all data" --> db
  worker --> db
  django -- "HTTP, request's trace" --> engine
  worker -- "HTTP" --> engine
  engine -- "statute text only" --> llm
  django -- "presign, check, delete" --> s3
```

- **Django owns every table.** The FastAPI service never connects to Postgres; Django sends what it needs and stores the answer ([ADR 0001](adr/0001-django-owns-all-data-fastapi-is-stateless.md)).
- **Tenant isolation twice:** every query is filtered by the active Tenant in the ORM, and Postgres row-level security enforces the same Tenant per transaction ([ADR 0006](adr/0006-shared-schema-tenant-isolation.md), [ADR 0022](adr/0022-postgres-rls-defense-in-depth.md)).
- **Authorization lives in services**, which receive the actor, so no entry point can skip it ([ADR 0020](adr/0020-authorization-in-the-service-layer.md)).

## Event flow: from a status change to a moved Risk

```mermaid
sequenceDiagram
  autonumber
  actor M as GRC Manager
  participant API as Django API
  participant DB as PostgreSQL
  participant OB as Outbox
  participant RE as Risk engine

  M->>API: PATCH implementation (If-Match: version)
  API->>DB: BEGIN; update Implementation (Activity Log row by trigger)
  API->>DB: insert ImplementationStatusChanged + one delivery per handler
  API->>DB: COMMIT
  API-->>M: 200 with the new version
  Note over API,OB: right after the commit, still in the request
  OB->>DB: claim delivery (FOR UPDATE SKIP LOCKED), as the event's Tenant
  OB->>DB: lock the treated Risks, read current statuses
  OB->>RE: POST /v1/risk-scores:batch
  RE-->>OB: Residual Ratings + method_version
  OB->>DB: store changed ratings, mark delivered, COMMIT
  alt the engine is down
    OB->>DB: attempts + 1, next try with backoff; the Risk shows "pending"
    Note over OB: drain_outbox retries until delivered or dead
  end
  M->>API: GET risk-matrix
  API-->>M: the Risk in its new cell
```

The change and its event commit together, so no reaction is lost when the engine is down ([ADR 0011](adr/0011-transactional-outbox-in-postgres.md)). The handler re-reads the current state instead of trusting the event, so a retry or a late delivery gives the same result. Every rating carries the method version that produced it ([ADR 0014](adr/0014-qualitative-versioned-risk-method.md)).
