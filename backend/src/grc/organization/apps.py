from django.apps import AppConfig


class OrganizationConfig(AppConfig):
    name = "grc.organization"
    label = "organization"
    verbose_name = "Organization"

    def ready(self) -> None:
        # Registers the API Token scheme with the schema generator.
        from grc.organization import schema  # noqa: F401
