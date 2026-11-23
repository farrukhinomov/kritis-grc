from django.urls import path

from grc.risk.api import (
    ApprovalsView,
    ApproveRiskAssessmentView,
    HazardsView,
    RejectRiskAssessmentView,
    RiskAssessmentsView,
    RiskMatrixView,
    RisksView,
    RiskView,
)

urlpatterns = [
    path("hazards", HazardsView.as_view(), name="hazards"),
    path("risks", RisksView.as_view(), name="risks"),
    path("risks/<uuid:risk_id>", RiskView.as_view(), name="risk"),
    path("risk-matrix", RiskMatrixView.as_view(), name="risk-matrix"),
    path("approvals", ApprovalsView.as_view(), name="approvals"),
    path("risk-assessments", RiskAssessmentsView.as_view(), name="risk-assessments"),
    path(
        "risk-assessments/<uuid:assessment_id>/approve",
        ApproveRiskAssessmentView.as_view(),
        name="risk-assessment-approve",
    ),
    path(
        "risk-assessments/<uuid:assessment_id>/reject",
        RejectRiskAssessmentView.as_view(),
        name="risk-assessment-reject",
    ),
]
