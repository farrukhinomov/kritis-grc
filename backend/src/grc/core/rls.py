"""Row-level security policies, written as migration operations.

Policies are plain SQL in each module's migrations, so what protects a table is visible
next to the table's own schema. `FORCE` applies the policy to the table owner too; only
superusers bypass it, and the application never connects as one.
"""

import re

from django.db import migrations

POLICY_NAME = "tenant_isolation"
# An unset or cleared setting reads as an empty string; NULLIF turns that into NULL, so
# the comparison is never true and no rows are visible (fail closed).
CURRENT_TENANT = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"
CURRENT_USER = "NULLIF(current_setting('app.user_id', true), '')::bigint"

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


def tenant_rls(table: str, condition: str | None = None) -> migrations.RunSQL:
    """Enables and forces RLS on `table` with one policy for reads and writes alike."""
    if not _IDENTIFIER.match(table):
        raise ValueError(f"Not a plain table name: {table!r}")
    check = condition or f"tenant_id = {CURRENT_TENANT}"
    # The table name is checked above and the condition comes from code, never from input.
    forward = (
        f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY;'
        f'ALTER TABLE "{table}" FORCE ROW LEVEL SECURITY;'
        f'CREATE POLICY {POLICY_NAME} ON "{table}" USING ({check}) WITH CHECK ({check});'
    )
    reverse = (
        f'DROP POLICY IF EXISTS {POLICY_NAME} ON "{table}";'
        f'ALTER TABLE "{table}" NO FORCE ROW LEVEL SECURITY;'
        f'ALTER TABLE "{table}" DISABLE ROW LEVEL SECURITY;'
    )
    return migrations.RunSQL(forward, reverse)
