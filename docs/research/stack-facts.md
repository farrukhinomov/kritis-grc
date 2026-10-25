# Stack facts behind the ADRs

Checked on 2026-10-25 against official docs, PyPI/npm and GitHub. Items marked _(unverified)_ need a check during implementation.

## Frontend
- **Ant Design 6** is the current major (6.6.x). v5 is on a maintenance branch (5.29.x). v6 needs React ≥ 18 and supports React 19 natively. CSS variables are on by default, and `@ant-design/icons` must be 6.x. Deprecated v5 APIs still work until v7. https://ant.design/docs/react/migration-v6
- **Motion** (motion.dev): MIT. Motion+ is a separate paid product and is not used.
- **@scalar/api-reference**: MIT.

## Django
- **Django 5.2 LTS** is supported until April 2028 and runs on Python 3.14 from 5.2.8. 6.0 is supported until April 2027, 6.1 until December 2027. **6.2 LTS** is due in April 2027 and supported until April 2030. https://www.djangoproject.com/download/
- **`django.tasks`** (Django 6.0+) ships only dev/test backends and no worker. The **django-tasks** package (BSD-3, 0.12) backports it; its database backend now lives in **django-tasks-db** (BSD-3, Django ≥ 5.2). **No automatic retries** (attempts are 0 or 1). Batch/run-until-empty worker mode _(unverified)_.
- **django-pghistory** (BSD-3): uses Postgres triggers, so it catches bulk and raw SQL writes. Context such as the acting user is set with transaction-local `set_config(..., true)` in the same statement, so it should work under transaction pooling _(unverified in practice)_. Provides diffs (`pgh_diff`).
- **django-allauth** (MIT): headless mode offers session tokens and JWT, but **no personal API tokens** _(absence not confirmed)_.
- **django-rest-knox** (MIT): hashed tokens, expiry, several tokens per user. Tied to the user, not to a Membership.
- **django-rls** (BSD-3, 2.0.1): young and lightly adopted; how it behaves under pooling isn't documented.
- With psycopg ≥ 3.1.8, Django uses **client-side binding by default** (no server-side prepared statements). Transaction pooling still requires `DISABLE_SERVER_SIDE_CURSORS=True`. https://docs.djangoproject.com/en/5.2/ref/databases/

## Postgres / Supabase
- Supavisor **transaction mode (6543) does not support prepared statements**; session mode (5432) does.
- RLS with `SET LOCAL` / `set_config(..., true)` inside `ATOMIC_REQUESTS` is safe with pooling. Pitfalls:
  - Queries outside the transaction get no Tenant, so fail closed.
  - The app role must not own the tables and must not have BYPASSRLS. Use `FORCE ROW LEVEL SECURITY`.
  - Migrations run over a direct connection.

## Hosting
- **Vercel external rewrites**: 120 s proxy timeout on all plans. The body limit for pure rewrites isn't documented _(test it)_. **Since 06.04.2026, new projects cache external-rewrite responses by default** when the upstream sends caching headers. Opt out with `x-vercel-enable-rewrite-caching: 0`. Hobby is "non-commercial personal use only". https://vercel.com/docs/rewrites

## Licenses
MinIO: AGPLv3, **repo archived 25.04.2026, no longer maintained**. SeaweedFS: Apache-2.0. moto: Apache-2.0. oasdiff: Apache-2.0. datamodel-code-generator: MIT. pydantic-settings: MIT. import-linter: BSD-2.
