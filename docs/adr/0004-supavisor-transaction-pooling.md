---
status: accepted
date: 2026-10-24
---

# Django connects through Supavisor in transaction mode

Cloud Run can scale out to many instances, while the Supabase free tier allows only a few direct connections. At runtime Django therefore connects through the Supavisor pooler in transaction mode (port 6543). Transaction pooling does not support server-side cursors, prepared statements or persistent connections, so `DISABLE_SERVER_SIDE_CURSORS=True`, `CONN_MAX_AGE=0` and psycopg 3 with prepared statements disabled are required. Migrations are the exception: they run as a Cloud Run Job over a direct/session connection.

## Consequences

- Do not raise `CONN_MAX_AGE` or re-enable server-side cursors "for performance". Under the pooler, both cause intermittent errors.
