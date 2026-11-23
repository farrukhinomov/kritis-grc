from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("risk", "0003_risks")]

    operations = [
        tenant_rls("risk_risk"),
        tenant_rls("risk_riskasset"),
        tenant_rls("risk_treatment"),
        tenant_rls("risk_riskevent"),
        immutable_events("risk_riskevent"),
        tenant_rls("risk_treatmentevent"),
        immutable_events("risk_treatmentevent"),
    ]
