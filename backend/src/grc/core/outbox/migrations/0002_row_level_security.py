from django.db import migrations

from grc.core.rls import tenant_rls


class Migration(migrations.Migration):
    dependencies = [("outbox", "0001_initial")]

    operations = [tenant_rls("outbox_outboxevent"), tenant_rls("outbox_outboxdelivery")]
