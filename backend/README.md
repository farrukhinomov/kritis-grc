# Backend (Django)

The Django API of the GRC platform: a modular monolith with one package per business module under `src/grc/`, plus shared technical plumbing in `src/grc/core/`.

## Requirements

- [uv](https://docs.astral.sh/uv/) (it installs Python 3.13 itself)
- Docker, for PostgreSQL

## Setup

```bash
cp .env.example .env            # then set DJANGO_SECRET_KEY (see the comment in the file)
uv sync                         # creates .venv with all dependencies from uv.lock
docker run -d --name grc-test-postgres -p 55432:5432 \
  -e POSTGRES_USER=grc -e POSTGRES_PASSWORD=grc -e POSTGRES_DB=grc postgres:17-alpine
```

Point `DATABASE_URL` in `.env` at `localhost:55432`. The tests use this throwaway database, the same way CI uses a service container. To run the whole system instead, use `docker compose up` from the repository root.

## Commands

| Task | Command |
|---|---|
| Run the dev server | `uv run python manage.py runserver` |
| Tests with coverage (≥ 80 % enforced) | `uv run pytest` |
| Lint | `uv run ruff check .` |
| Format | `uv run ruff format .` |
| Type-check (strict) | `uv run mypy src manage.py` |
| Module boundaries | `PYTHONPATH=src uv run lint-imports` |
| Deployment checks | `APP_ENV=production uv run python manage.py check --deploy` |
| Container image | `docker build -t grc-backend .` |

`mypy` and `manage.py` load the settings, so they need the variables from `.env`.

## Layout

```
src/
  config/         settings, URLs, WSGI, gunicorn, validated environment (env.py)
  grc/
    core/         request/trace IDs, access log, cache headers, health probes
    <module>/     organization · assets · compliance · risk · activity · demo
      api/ services/ selectors/ models/ events/ tests/
```

The import rules between modules and layers are enforced by import-linter (see `pyproject.toml`).

## Endpoints so far

| Path | Purpose |
|---|---|
| `GET /health/live` | Process is up (no database access) |
| `GET /health/ready` | Database reachable, `503` otherwise |
| `GET /api/v1/schema` | OpenAPI schema |
| `/api/_admin/` | Django admin (Platform Admins) |
