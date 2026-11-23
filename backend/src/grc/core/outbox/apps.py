from django.apps import AppConfig
from django.utils.module_loading import autodiscover_modules


class OutboxConfig(AppConfig):
    name = "grc.core.outbox"
    label = "outbox"
    verbose_name = "Outbox"

    def ready(self) -> None:
        # Every module subscribes its handlers in `<module>.events.handlers`; importing
        # them here registers all of them before the first event is published.
        autodiscover_modules("events.handlers")
