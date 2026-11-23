from django.contrib import admin
from django.db import transaction
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

from config.views import api_reference

urlpatterns = [
    path("api/_admin/", admin.site.urls),
    # Public on purpose: the API reference is open to read; calling the API is not.
    # It is generated from code and needs no database transaction.
    path(
        "api/v1/schema",
        transaction.non_atomic_requests(SpectacularAPIView.as_view()),
        name="openapi-schema",
    ),
    # Public like the schema it renders, and static, so it needs no transaction.
    path("api/ui", transaction.non_atomic_requests(api_reference), name="api-reference"),
    path("api/v1/", include("grc.organization.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.compliance.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.activity.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.assets.api.urls")),
    path("api/v1/tenants/<slug:tenant_slug>/", include("grc.risk.api.urls")),
]
