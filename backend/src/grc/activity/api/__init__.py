"""The Activity Log, newest first, paged by cursor."""

from typing import Any

from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from grc.activity.selectors import ACTIONS, DEFAULT_LIMIT, MAX_LIMIT, activity
from grc.core.actor import Permission
from grc.core.api import TenantScopedAPIView
from grc.core.problems import Problem

# "from" is a Python keyword, so this shape is described inline rather than as a class.
FieldChangeOut = inline_serializer(
    "FieldChange",
    {
        "field": serializers.CharField(),
        "from": serializers.CharField(allow_null=True),
        "to": serializers.CharField(allow_null=True),
    },
)


class ActivityEntryOut(serializers.Serializer[Any]):
    id = serializers.CharField()
    occurred_at = serializers.DateTimeField()
    actor_id = serializers.CharField()
    actor_name = serializers.CharField()
    action = serializers.ChoiceField(choices=[(a, a) for a in ACTIONS])
    object_type = serializers.CharField()
    object_id = serializers.CharField()
    object_label = serializers.CharField()
    changes = serializers.ListField(child=FieldChangeOut)


ActivityPageOut = inline_serializer(
    "ActivityPage",
    {
        "items": ActivityEntryOut(many=True),
        "page": inline_serializer(
            "CursorPageInfo",
            {
                "next_cursor": serializers.CharField(allow_null=True),
                "limit": serializers.IntegerField(),
            },
        ),
    },
)


class ActivityView(TenantScopedAPIView):
    @extend_schema(
        operation_id="activity_list",
        summary="Who changed what, newest first",
        parameters=[
            OpenApiParameter(name, str, required=False)
            for name in ("cursor", "limit", "object_id", "object_type", "action")
        ],
        responses={200: ActivityPageOut},
    )
    def get(self, request: Request, tenant_slug: str) -> Response:
        self.actor.require(Permission.VIEW)
        query = request.query_params
        raw_limit = query.get("limit", str(DEFAULT_LIMIT))
        if not raw_limit.isdigit() or int(raw_limit) < 1:
            raise Problem(
                status.HTTP_400_BAD_REQUEST,
                "invalid_pagination",
                "limit must be a positive integer.",
            )
        return Response(
            activity(
                self.actor,
                limit=min(int(raw_limit), MAX_LIMIT),
                cursor=query.get("cursor"),
                object_id=query.get("object_id"),
                object_type=query.get("object_type"),
                action=query.get("action"),
            )
        )
