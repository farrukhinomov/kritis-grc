from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from grc.demo.services import NotDemoTenantError, reset_demo


class Command(BaseCommand):
    help = "Resets the Demo Tenant to its fixtures and signs out demo visitors. Nightly."

    def handle(self, *args: Any, **options: Any) -> None:
        try:
            reset_demo(settings.SEED_DIR)
        except NotDemoTenantError as error:
            raise CommandError(str(error)) from error
        self.stdout.write("Demo Tenant reset.")
