from django.db import migrations

from grc.core.rls import tenant_rls


class Migration(migrations.Migration):
    dependencies = [("compliance", "0003_implementations")]

    operations = [tenant_rls("compliance_implementation")]
