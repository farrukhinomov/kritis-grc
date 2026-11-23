from django.db import migrations

from grc.core.rls import CURRENT_TENANT, CURRENT_USER, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("organization", "0001_initial")]

    operations = [
        tenant_rls("organization_scope"),
        tenant_rls("organization_membershipscope"),
        # Login lists a user's Memberships across Tenants before one is chosen, so a row
        # is also visible to the user it belongs to.
        tenant_rls(
            "organization_membership",
            f"tenant_id = {CURRENT_TENANT} OR user_id = {CURRENT_USER}",
        ),
    ]
