from django.contrib import admin
from django.db import transaction
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

urlpatterns = [
    path("api/_admin/", admin.site.urls),
    # Public on purpose: the API reference is open to read; calling the API is not.
    # It is generated from code and needs no database transaction.
    path(
        "api/v1/schema",
        transaction.non_atomic_requests(SpectacularAPIView.as_view()),
        name="openapi-schema",
    ),
    path("api/v1/", include("grc.organization.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.compliance.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.activity.api.urls")),
]
