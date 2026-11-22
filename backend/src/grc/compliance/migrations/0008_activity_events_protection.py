from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls

EVENT_TABLES = (
    "compliance_implementationevent",
    "compliance_evidenceevent",
    "compliance_tenantmappingevent",
)


class Migration(migrations.Migration):
    dependencies = [("compliance", "0007_activity_events")]

    operations = [
        operation
        for table in EVENT_TABLES
        for operation in (tenant_rls(table), immutable_events(table))
    ]
