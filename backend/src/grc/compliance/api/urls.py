from django.urls import path

from grc.compliance.api import FrameworksView, MappingsView, RequirementsView, RequirementView
from grc.compliance.api.implementations import (
    ComplianceParagraphsView,
    ComplianceSummaryView,
    ImplementationsView,
    ImplementationView,
)

urlpatterns = [
    path("frameworks", FrameworksView.as_view(), name="frameworks"),
    path("requirements", RequirementsView.as_view(), name="requirements"),
    path("requirements/<str:requirement_id>", RequirementView.as_view(), name="requirement"),
    path("mappings", MappingsView.as_view(), name="mappings"),
    path("implementations", ImplementationsView.as_view(), name="implementations"),
    path(
        "implementations/<uuid:implementation_id>",
        ImplementationView.as_view(),
        name="implementation",
    ),
    path("compliance-summary", ComplianceSummaryView.as_view(), name="compliance-summary"),
    path("compliance-paragraphs", ComplianceParagraphsView.as_view(), name="compliance-paragraphs"),
]
