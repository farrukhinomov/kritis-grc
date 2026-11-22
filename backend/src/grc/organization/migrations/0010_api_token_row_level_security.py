from django.db import migrations

from grc.core.rls import CURRENT_TENANT, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("organization", "0009_api_tokens")]

    operations = [
        # A token is looked up by its prefix before its Tenant is known; while the lookup
        # names a prefix, that one row is visible.
        tenant_rls(
            "organization_apitoken",
            f"tenant_id = {CURRENT_TENANT} "
            "OR prefix = NULLIF(current_setting('app.token_prefix', true), '')",
        ),
    ]
