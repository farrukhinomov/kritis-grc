from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):
    # Search compares without accents in the database, so it never loads whole tables.
    dependencies = [("organization", "0010_api_token_row_level_security")]

    operations = [UnaccentExtension()]
