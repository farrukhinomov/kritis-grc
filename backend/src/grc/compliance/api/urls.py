from django.urls import path

from grc.compliance.api import FrameworksView, MappingsView, RequirementsView, RequirementView
from grc.compliance.api.evidence import EvidenceListView, EvidenceView, UploadsView
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
    path(
        "implementations/<uuid:implementation_id>/evidence",
        EvidenceListView.as_view(),
        name="evidence-list",
    ),
    path(
        "implementations/<uuid:implementation_id>/evidence/<uuid:evidence_id>",
        EvidenceView.as_view(),
        name="evidence",
    ),
    path("uploads", UploadsView.as_view(), name="uploads"),
    path("compliance-summary", ComplianceSummaryView.as_view(), name="compliance-summary"),
    path("compliance-paragraphs", ComplianceParagraphsView.as_view(), name="compliance-paragraphs"),
]
