from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("organization", "0007_activity_events")]

    operations = [
        tenant_rls("organization_scopeevent"),
        immutable_events("organization_scopeevent"),
    ]
