from django.db import migrations

from grc.core.rls import immutable_events, tenant_rls


class Migration(migrations.Migration):
    dependencies = [("compliance", "0009_mapping_suggestions")]

    operations = [
        tenant_rls("compliance_mappingsuggestion"),
        tenant_rls("compliance_mappingsuggestionevent"),
        immutable_events("compliance_mappingsuggestionevent"),
    ]
