# syntax=docker/dockerfile:1

# Base images are pinned by digest so builds are reproducible and updates deliberate.
ARG PYTHON_IMAGE=python:3.13-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff

FROM ${UV_IMAGE} AS uv

FROM ${PYTHON_IMAGE} AS builder
COPY --from=uv /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app

# Dependencies first, in their own layer, so code changes don't reinstall them.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project

COPY manage.py ./
COPY src ./src

# Scalar renders the API reference at /api/ui. It is served from here rather than from a
# CDN, so the page runs under a self-only CSP and never loads third-party code. The
# download is pinned by checksum; the version was at least two weeks old when chosen. The
# source map reference is dropped: the map isn't shipped, and the manifest storage refuses
# to hash a file whose map it can't find.
ARG SCALAR_VERSION=1.76.4
ADD --checksum=sha256:b8b74a96c74c6fd06f1dc604ddbf8385fd0b14a0bb9467bb8f27b59978be168c \
    https://registry.npmjs.org/@scalar/api-reference/-/api-reference-${SCALAR_VERSION}.tgz \
    /tmp/scalar.tgz
RUN mkdir -p vendor-static/scalar \
    && tar -xzf /tmp/scalar.tgz -O package/dist/browser/standalone.js \
       | sed '/^\/\/# sourceMappingURL=/d' > vendor-static/scalar/standalone.js \
    && rm /tmp/scalar.tgz

# Settings are validated even for collectstatic. These placeholders exist only in this
# build step; the runtime image gets its real configuration from the platform.
RUN APP_ENV=production \
    DJANGO_SECRET_KEY=build-only-placeholder-never-used-at-runtime-0123456789abcdef \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    ALLOWED_HOSTS=build.invalid \
    CSRF_TRUSTED_ORIGINS=https://build.invalid \
    PYTHONPATH=/app/src \
    /app/.venv/bin/python manage.py collectstatic --noinput


FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    PATH="/app/.venv/bin:${PATH}" \
    PORT=8080

# Debian publishes security fixes days before the official Python image is rebuilt, so
# they are applied here; the pinned digest still fixes everything else about the base.
# The base image's pip is never used at runtime (dependencies live in /app/.venv), and
# the copies of libraries vendored inside it only add attack surface and scanner noise.
RUN apt-get update \
    && apt-get upgrade --yes --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip uninstall --yes pip \
    && groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
# Files stay owned by root, so the application user can read but never modify its code.
COPY --from=builder /app /app
# The shared demo fixtures live outside this build context and come in as the named
# context "seed" (compose: additional_contexts, CI: build-contexts).
COPY --from=seed . /app/seed
ENV SEED_DIR=/app/seed

USER app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ['PORT']}/health/live\", timeout=2)"]

CMD ["gunicorn", "--config", "python:config.gunicorn", "config.wsgi"]
