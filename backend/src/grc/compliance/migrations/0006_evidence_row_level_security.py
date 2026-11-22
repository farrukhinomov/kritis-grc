from django.db import migrations

from grc.core.rls import tenant_rls


class Migration(migrations.Migration):
    dependencies = [("compliance", "0005_evidence")]

    operations = [tenant_rls("compliance_evidence"), tenant_rls("compliance_upload")]
