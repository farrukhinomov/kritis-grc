from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("risk", "0001_initial")]

    operations = [
        tenant_rls("risk_hazard"),
        tenant_rls("risk_hazardevent"),
        immutable_events("risk_hazardevent"),
    ]
