---
status: accepted
date: 2026-10-25
---

# Domain events go through a transactional outbox in Postgres

Modules talk to each other about things that have happened through **domain events** (e.g. `ImplementationStatusChanged`), not direct calls. For example, `compliance` doesn't know that `risk` reacts to its changes. The service that causes a change writes the event to an outbox table in the same transaction as the change, so the event cannot be lost even if the FastAPI service or R2 is down at that moment. Workers claim rows with `SELECT … FOR UPDATE SKIP LOCKED`. We deliberately run no message broker (Redis, Pub/Sub, RabbitMQ): it would cost money beyond the free tier, tie us to a vendor, and need dual writes to stay consistent with the database. Events were chosen over commands because new reactions (notifications, KPIs, a future extracted service) can subscribe without changing the module that emits the event.

## Considered options

- **Celery**, the Django community standard: rejected because it needs a broker (Redis/RabbitMQ), which conflicts with the free-tier and vendor-independence constraints, and enqueueing to a broker isn't transactional with the database.
- **`django.tasks` with django-tasks-db** (DEP 14, the future Django standard): rejected for now. It has no automatic retries (attempts are 0 or 1), the backend is still 0.x, and per-handler delivery tracking would still need building. Handlers are written behind an interface shaped like `@task`, so switching once it matures is a mechanical change.

## Consequences

- Every handler must be idempotent. An event can be delivered to the same handler more than once.
- Each event gets one delivery row per handler, with its own attempts, backoff and `dead` state. A failing handler is retried without re-running the ones that succeeded.
- Delivery is first attempted right after commit, inside the request. Whatever fails is retried by the drain endpoint, which Cloud Scheduler calls every minute.
- Order is not guaranteed. Handlers treat an event as a trigger and re-read current state from the database instead of trusting the payload.
- The Activity Log is not built from events (ADR 0009). It records changes for humans, synchronously; events tell modules to react.
- Slow or failing work (risk recalculation, AI mapping suggestions, R2 cleanup) runs in handlers, never inside the user's request transaction.
- Throughput is limited by Postgres. If it ever becomes the bottleneck, the outbox can feed a broker without changing the services that emit events.
