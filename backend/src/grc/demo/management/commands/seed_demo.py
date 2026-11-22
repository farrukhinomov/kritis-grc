from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand

from grc.demo.services import load_demo


class Command(BaseCommand):
    help = "Creates or restores the Demo Tenant from the shared fixtures. Safe to repeat."

    def handle(self, *args: Any, **options: Any) -> None:
        load_demo(settings.SEED_DIR)
        self.stdout.write("Demo Tenant loaded.")
