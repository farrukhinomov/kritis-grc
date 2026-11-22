from django.urls import path

from grc.organization.api import DemoLoginView, LoginView, LogoutView, MeView
from grc.organization.api.tenants import MembersView, TenantView

urlpatterns = [
    path("me", MeView.as_view(), name="me"),
    path("auth/login", LoginView.as_view(), name="login"),
    path("auth/demo-login", DemoLoginView.as_view(), name="demo-login"),
    path("auth/logout", LogoutView.as_view(), name="logout"),
    path("tenants/<slug:tenant_slug>", TenantView.as_view(), name="tenant"),
    path("tenants/<slug:tenant_slug>/members", MembersView.as_view(), name="members"),
]
