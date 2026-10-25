"""Gunicorn settings for running in a container behind the platform's load balancer."""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '8080')}"

# Threads suit an I/O-bound API: most time is spent waiting on the database and the
# risk engine. Two processes keep one instance serving while the other restarts.
worker_class = "gthread"
workers = int(os.environ.get("GUNICORN_WORKERS", "2"))
threads = int(os.environ.get("GUNICORN_THREADS", "4"))

# Size the platform's per-instance concurrency to workers x threads, so requests queue at
# the load balancer instead of inside an overloaded instance.

# The platform enforces request timeouts itself; a worker timeout on top would only
# kill slow but healthy requests.
timeout = 0
# Shorter than the platform's grace period after SIGTERM, so in-flight requests finish
# before the container is killed.
graceful_timeout = 8

# Worker heartbeats on the container's overlay filesystem can stall; memory is reliable.
worker_tmp_dir = "/dev/shm"  # noqa: S108 - holds only heartbeat files, no data

# Only the load balancer can reach the container, so its forwarded headers are trusted.
forwarded_allow_ips = "*"

# Django writes one structured access line per request; gunicorn's own would duplicate it.
accesslog = None
logconfig_dict = {
    "version": 1,
    "disable_existing_loggers": False,
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
        },
    },
    # Gunicorn merges this over its defaults key by key, so `root` must be replaced too,
    # or it keeps pointing at gunicorn's default handler that no longer exists.
    "root": {"handlers": ["stdout"], "level": "INFO"},
    "loggers": {"gunicorn.error": {"handlers": ["stdout"], "level": "INFO", "propagate": False}},
}
