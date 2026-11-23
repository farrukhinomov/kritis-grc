from django.urls import path

from grc.activity.api import ActivityView

urlpatterns = [path("activity", ActivityView.as_view(), name="activity")]
