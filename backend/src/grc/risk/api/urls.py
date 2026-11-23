from django.urls import path

from grc.risk.api import HazardsView, RiskMatrixView, RisksView, RiskView

urlpatterns = [
    path("hazards", HazardsView.as_view(), name="hazards"),
    path("risks", RisksView.as_view(), name="risks"),
    path("risks/<uuid:risk_id>", RiskView.as_view(), name="risk"),
    path("risk-matrix", RiskMatrixView.as_view(), name="risk-matrix"),
]
