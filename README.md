# GRC Platform: KRITIS-Dachgesetz

A multi-tenant governance, risk and compliance SaaS for operators of critical facilities in Germany. It covers the KRITIS-Dachgesetz (physical resilience) and maps it to NIS2 as implemented in the BSIG, so one piece of work counts toward both.

> **Status:** design phase. No code yet. The live demo, setup instructions and architecture overview will be added as milestones land (see [docs/scope.md](docs/scope.md)).

## Where to start

| You want to… | Read |
|---|---|
| Understand the domain language | [GLOSSARY.md](GLOSSARY.md) |
| See what is built, and when | [docs/scope.md](docs/scope.md) |
| Understand why it is built this way | [docs/adr/](docs/adr/README.md) |
| Follow the day-to-day rules | [docs/conventions.md](docs/conventions.md) |
| Work on this repo with an AI assistant | [CLAUDE.md](CLAUDE.md) |
| Browse all documentation | [docs/README.md](docs/README.md) |

## Run locally

Requires Docker. Copy the example configuration and fill in random values:

```bash
cp .env.example .env
```

| Stack | Command | Open |
|---|---|---|
| Development (hot reload, Vite on the real API) | `docker compose up` | http://localhost:5173 |
| Production-like (gunicorn, nginx, TLS to Postgres, S3 storage) | `docker compose -f compose.prod.yaml up --build` | http://localhost:8081 |

The prototype on mock data needs only the frontend: see [frontend/README.md](frontend/README.md). Each service's own commands are in [backend/](backend/README.md), [services/risk-engine/](services/risk-engine/README.md) and [frontend/](frontend/README.md).

## License

Proprietary. All rights reserved. The source is visible for evaluation only. See [LICENSE](LICENSE). Security issues: see [.github/SECURITY.md](.github/SECURITY.md).
