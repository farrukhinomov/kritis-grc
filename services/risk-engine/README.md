# Risk engine (FastAPI)

A stateless service that calculates Residual Ratings on the 4x4 risk matrix. It holds no data and opens no database connection; only the Django API calls it.

## Setup and commands

Requires [uv](https://docs.astral.sh/uv/). Run everything from this folder.

| Task | Command |
|---|---|
| Install | `uv sync` |
| Run locally | `APP_ENV=local uv run python -m risk_engine` (docs at `http://localhost:8080/docs`) |
| Run with auto-reload | `APP_ENV=local uv run uvicorn risk_engine.main:create_app_from_env --factory --reload --port 8080` |
| Tests with coverage (≥ 80 % enforced) | `uv run pytest` |
| Lint and format | `uv run ruff check . && uv run ruff format --check .` |
| Type-check (strict) | `uv run mypy src tests` |
| Export the OpenAPI schema | `uv run python -m risk_engine.export_openapi openapi.json` |
| Container image | `docker build -t grc-risk-engine .` |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `APP_ENV` | yes | `local`, `test` or `production`. Production serves no docs and no schema. |
| `LOG_LEVEL` | no | `DEBUG`, `INFO` (default), `WARNING`, `ERROR` |
| `PORT` | no | Listen port, default `8080` |

## Layout

```
src/risk_engine/
  domain/      pure calculation rules (residual rating, categories, method version)
  schemas/     request/response models with their bounds
  routers/     HTTP endpoints, no logic
  problems.py  RFC 9457 error responses
  middleware.py, request_context.py, log_setup.py   request/trace IDs and JSON logs
```

## Endpoints

| Path | Purpose |
|---|---|
| `POST /v1/risk-scores:batch` | Up to 500 Risks per call → Residual Rating, score, category, explanations, `method_version` |
| `GET /health/live`, `GET /health/ready` | Probes |
