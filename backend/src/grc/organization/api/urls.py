from django.urls import path

from grc.organization.api import DemoLoginView, LoginView, LogoutView, MeView
from grc.organization.api.deadlines import DeadlinesView
from grc.organization.api.tenants import (
    CriticalServicesView,
    MembersView,
    ScopesView,
    ScopeView,
    TenantView,
)
from grc.organization.api.tokens import ApiTokensView, ApiTokenView

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/demo-login", DemoLoginView.as_view(), name="demo-login"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("tenants/<slug:tenant_slug>", TenantView.as_view(), name="tenant"),
    path("tenants/<slug:tenant_slug>/members", MembersView.as_view(), name="members"),
    path("tenants/<slug:tenant_slug>/scopes", ScopesView.as_view(), name="scopes"),
    path("tenants/<slug:tenant_slug>/scopes/<uuid:scope_id>", ScopeView.as_view(), name="scope"),
    path("tenants/<slug:tenant_slug>/api-tokens", ApiTokensView.as_view(), name="api-tokens"),
    path(
        "tenants/<slug:tenant_slug>/api-tokens/<uuid:token_id>",
        ApiTokenView.as_view(),
        name="api-token",
    ),
    path("tenants/<slug:tenant_slug>/deadlines", DeadlinesView.as_view(), name="deadlines"),
    path(
        "tenants/<slug:tenant_slug>/critical-services",
        CriticalServicesView.as_view(),
        name="critical-services",
    ),
]
