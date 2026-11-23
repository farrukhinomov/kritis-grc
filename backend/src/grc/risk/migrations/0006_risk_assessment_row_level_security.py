from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("risk", "0005_risk_assessments")]

    operations = [
        tenant_rls("risk_riskassessment"),
        tenant_rls("risk_riskassessmentrisk"),
        tenant_rls("risk_riskassessmentevent"),
        immutable_events("risk_riskassessmentevent"),
    ]
