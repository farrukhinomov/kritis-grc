"""Container entry point: `python -m risk_engine`."""

import uvicorn

from risk_engine.log_setup import configure_logging, logging_config
from risk_engine.main import create_app
from risk_engine.settings import load_settings


def main() -> None:
    settings = load_settings()
    configure_logging(settings.log_level)
    uvicorn.run(
        create_app(settings),
        host="0.0.0.0",  # noqa: S104 - inside a container; the platform controls exposure
        port=settings.port,
        log_config=logging_config(settings.log_level),
        # The access line is written by our middleware, with request and trace IDs.
        access_log=False,
        # Only the platform's load balancer can reach the container.
        proxy_headers=True,
        forwarded_allow_ips="*",
        # Shorter than the platform's grace period after SIGTERM.
        timeout_graceful_shutdown=8,
    )


if __name__ == "__main__":
    main()
