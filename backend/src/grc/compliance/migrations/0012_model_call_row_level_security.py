from django.db import migrations

from grc.core.rls import tenant_rls


class Migration(migrations.Migration):
    dependencies = [("compliance", "0011_model_calls")]

    operations = [tenant_rls("compliance_modelcall")]
