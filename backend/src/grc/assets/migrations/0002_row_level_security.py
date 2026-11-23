from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("assets", "0001_initial")]

    operations = [
        tenant_rls("assets_asset"),
        tenant_rls("assets_assetdependency"),
        tenant_rls("assets_assetevent"),
        immutable_events("assets_assetevent"),
    ]
