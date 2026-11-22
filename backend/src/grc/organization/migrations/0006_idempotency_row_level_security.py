from django.db import migrations

from grc.core.rls import tenant_rls


class Migration(migrations.Migration):
    dependencies = [("organization", "0005_critical_facilities_and_idempotency")]

    operations = [tenant_rls("organization_idempotencyrecord")]
