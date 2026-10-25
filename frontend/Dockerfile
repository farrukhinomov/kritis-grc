# syntax=docker/dockerfile:1

# Base images are pinned by digest so builds are reproducible and updates deliberate.
ARG NODE_IMAGE=node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6

FROM ${NODE_IMAGE} AS build
# pnpm's exact version comes from the packageManager field in package.json.
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
# Baked in at build time: "enabled" produces the prototype that runs on mock data.
ARG VITE_API_MOCKING=disabled
ENV VITE_API_MOCKING=${VITE_API_MOCKING}
RUN pnpm build


# Runs as an unprivileged user on port 8080, so it needs no root at any point.
FROM ${NGINX_IMAGE} AS runtime
ENV API_UPSTREAM=http://backend:8080
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
