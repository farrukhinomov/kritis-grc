from django.urls import path

from grc.compliance.api import FrameworksView, MappingsView, RequirementsView, RequirementView

urlpatterns = [
    path("frameworks", FrameworksView.as_view(), name="frameworks"),
    path("requirements", RequirementsView.as_view(), name="requirements"),
    path("requirements/<str:requirement_id>", RequirementView.as_view(), name="requirement"),
    path("mappings", MappingsView.as_view(), name="mappings"),
]
