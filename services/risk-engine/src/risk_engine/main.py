from fastapi import FastAPI

from risk_engine import problems
from risk_engine.middleware import RequestContextMiddleware
from risk_engine.routers import health, risk_scores
from risk_engine.settings import Settings, load_settings

VERSION = "0.1.0"


def create_app(settings: Settings) -> FastAPI:
    # Only the API service may call this one, and it reads the schema at build time, so
    # production exposes neither the interactive docs nor the schema.
    docs_enabled = not settings.is_production
    app = FastAPI(
        title="GRC Risk Engine",
        version=VERSION,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    problems.install(app)
    app.include_router(health.router)
    app.include_router(risk_scores.router)
    app.add_middleware(RequestContextMiddleware)
    return app


def create_app_from_env() -> FastAPI:
    """Factory for `uvicorn --factory --reload` in local development."""
    return create_app(load_settings())
