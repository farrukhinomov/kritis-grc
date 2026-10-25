---
status: accepted
date: 2026-10-24
---

# Django owns all data; the FastAPI service is stateless

Django and FastAPI run as two separate Cloud Run services. Django is the only service that connects to Postgres and owns every table and migration. The FastAPI service (risk calculation, AI mapping suggestions) gets everything it needs in the request and has no database connection. We chose this so there is never a second ORM over the same schema or two sets of migrations drifting apart.

## Consequences

- The browser never calls FastAPI directly. Django calls it and persists the results.
- When FastAPI needs more data, Django has to send it in the request. FastAPI must not query the database for it.
