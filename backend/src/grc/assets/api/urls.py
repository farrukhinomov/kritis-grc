from django.urls import path

from grc.assets.api import AssetsView

urlpatterns = [path("assets", AssetsView.as_view(), name="assets")]
