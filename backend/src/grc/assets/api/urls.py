from django.urls import path

from grc.assets.api import AssetsView, DependencyGraphView

urlpatterns = [
    path("assets", AssetsView.as_view(), name="assets"),
    path("dependency-graph", DependencyGraphView.as_view(), name="dependency-graph"),
]
