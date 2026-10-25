#!/usr/bin/env bash
# Creates the role the application connects with. It owns nothing and can never bypass
# row-level security, so tenant isolation holds even for its raw queries. Migrations run
# as the owner role (POSTGRES_USER), which creates the tables; the grants below give the
# application role data access to everything the owner creates later.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_role="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v owner_role="$POSTGRES_USER" \
  <<'SQL'
CREATE ROLE :"app_role" LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";
SQL
