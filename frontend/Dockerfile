# syntax=docker/dockerfile:1

# Base images are pinned by digest so builds are reproducible and updates deliberate.
ARG NODE_IMAGE=node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
# nginx follows the mainline branch: it gets every fix first, while the stable branch only
# receives the ones its maintainers backport, and its images lagged weeks behind on CVEs.
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

FROM ${NODE_IMAGE} AS build
# pnpm's exact version comes from the packageManager field in package.json.
RUN corepack enable
WORKDIR /app

# pnpm-workspace.yaml carries the dependency overrides the lockfile was resolved with.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
# The demo fixtures live in the repository's seed/ folder, outside this build context,
# and come in as the named context "seed" (compose: additional_contexts, CI: build-contexts).
COPY --from=seed . /seed
# Baked in at build time: "enabled" produces the prototype that runs on mock data.
ARG VITE_API_MOCKING=disabled
ENV VITE_API_MOCKING=${VITE_API_MOCKING}
RUN pnpm build


# Serves as an unprivileged user on port 8080; root is used only to apply OS patches.
FROM ${NGINX_IMAGE} AS runtime
# Security patches published after the pinned base image are applied on every build. A
# build cache would keep the first upgrade forever, so CI passes the day: the layer is
# renewed at least daily.
USER root
ARG OS_PATCH_DAY=unset
RUN echo "OS patches as of ${OS_PATCH_DAY}" && apk upgrade --no-cache
USER 101
ENV API_UPSTREAM=http://backend:8080
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
