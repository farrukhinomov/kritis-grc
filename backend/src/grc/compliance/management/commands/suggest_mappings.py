from typing import Any

from django.core.management.base import BaseCommand, CommandError, CommandParser

from grc.compliance.services.suggestion_runs import suggest_mappings
from grc.organization.selectors import tenant_id_for


class Command(BaseCommand):
    help = "Asks the AI for Mapping Suggestions of one Tenant, within its daily cap."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("tenant", help="The Tenant's slug.")
        parser.add_argument("--limit", type=int, default=None, help="At most this many calls.")

    def handle(self, *args: Any, **options: Any) -> None:
        tenant_id = tenant_id_for(options["tenant"])
        if tenant_id is None:
            raise CommandError(f"No Tenant {options['tenant']!r}.")
        summary = suggest_mappings(tenant_id, limit=options["limit"])
        self.stdout.write(
            f"Asked {summary.asked}, {summary.created} new suggestions, "
            f"{summary.declined} without answer"
            + (f"; stopped: {summary.stopped}." if summary.stopped else ".")
        )
        if summary.stopped == "unavailable":
            raise CommandError("The AI service is unavailable; try again later.")
