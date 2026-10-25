---
status: accepted
date: 2026-10-25
---

# A modular monolith plus one extracted service

The Django backend is a modular monolith with one app per bounded context: `organization`, `assets`, `compliance`, `risk`, `activity`, `demo`. The only separate service is the stateless FastAPI service (ADR 0001). It was extracted because its workload differs: CPU-bound risk calculation and slow, failure-prone LLM calls. We rejected splitting into a microservice per entity. That would add network hops, distributed transactions and deployment overhead with no difference in scaling to justify it, and it isn't possible on one free-tier instance per service anyway.

## Consequences

- Each module has the same layers: thin DRF API → `services` (writes, transactions, permission checks, domain events) → `selectors` (reads) → models.
- import-linter contracts in CI allow a module to use another module only through its `services`/`selectors`. Cross-module foreign keys are allowed for reads, but only the owning module writes its tables.
- A module that later needs to be extracted already has a narrow public interface to turn into an API.
