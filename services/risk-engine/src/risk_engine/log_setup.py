import logging
import logging.config
from typing import Any

from risk_engine.request_context import current_request_id, current_trace_id


class RequestContextFilter(logging.Filter):
    """Adds the current request and trace IDs to every log record that lacks them."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = current_request_id()
        if not hasattr(record, "trace_id"):
            record.trace_id = current_trace_id()
        return True


def logging_config(level: str) -> dict[str, Any]:
    """JSON lines on stdout, the format the API service writes too."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {"request_context": {"()": RequestContextFilter}},
        "formatters": {
            "json": {
                "()": "pythonjsonlogger.json.JsonFormatter",
                "fmt": "%(asctime)s %(levelname)s %(name)s %(message)s",
                "rename_fields": {"asctime": "time", "levelname": "severity", "name": "logger"},
            },
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "json",
                "filters": ["request_context"],
            },
        },
        "root": {"handlers": ["stdout"], "level": level},
        # Uvicorn's own loggers propagate to root, so everything comes out as JSON.
        "loggers": {
            "uvicorn": {"handlers": [], "propagate": True},
            "uvicorn.error": {"handlers": [], "propagate": True},
            "uvicorn.access": {"handlers": [], "propagate": False},
        },
    }


def configure_logging(level: str) -> None:
    logging.config.dictConfig(logging_config(level))
