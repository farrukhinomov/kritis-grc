from django.urls import path

from grc.risk.api import HazardsView

urlpatterns = [path("hazards", HazardsView.as_view(), name="hazards")]
