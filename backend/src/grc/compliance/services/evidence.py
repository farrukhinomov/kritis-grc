"""Evidence: a file, a link, or a reference to other work that already proves it.

Files go straight from the browser to storage with a presigned PUT and are checked
twice. When the URL is issued, the announced name, size and type must be within the
limits. When the Evidence is confirmed, what actually arrived must match the
announcement and its first bytes must match the type: the browser's type comes from the
file name, so a web page renamed to .pdf would pass a check that trusted it.
"""

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from django.db import transaction
from django.utils import timezone
from rest_framework import status

from grc.compliance.models import Evidence, EvidenceKind, Implementation, Upload
from grc.core.actor import Actor, Permission
from grc.core.problems import FieldProblem, Problem
from grc.core.storage import storage

MAX_BYTES = 20 * 1024 * 1024
UPLOAD_URL_LIFETIME = timedelta(minutes=5)
OFFICE_TYPES = frozenset(
    {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
)
FILE_TYPES = frozenset({"application/pdf", "image/png", "image/jpeg"}) | OFFICE_TYPES
_SIGNATURES = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    # DOCX and XLSX are both ZIP containers; the announced type tells them apart.
    (b"PK\x03\x04", "application/zip"),
)


def request_upload(actor: Actor, name: str, size_bytes: int, content_type: str) -> dict[str, Any]:
    actor.require(Permission.CHANGE)
    if not 0 < size_bytes <= MAX_BYTES:
        raise FieldProblem([{"field": "file", "code": "invalid_size"}])
    if content_type not in FILE_TYPES:
        raise FieldProblem([{"field": "file", "code": "unsupported_type"}])
    upload_id = uuid4()
    # Keys are scoped by Tenant, so a leaked key can't name another Tenant's file.
    key = f"tenants/{actor.tenant_id}/uploads/{upload_id}"
    expires_at = timezone.now() + UPLOAD_URL_LIFETIME
    url = storage().presign_put(
        key, content_type, size_bytes, int(UPLOAD_URL_LIFETIME.total_seconds())
    )
    Upload.objects.create(
        id=upload_id,
        user_id=actor.user_id,
        name=name,
        size_bytes=size_bytes,
        content_type=content_type,
        key=key,
        expires_at=expires_at,
    )
    return {
        "upload_id": str(upload_id),
        "upload_url": url,
        "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
    }


def add_evidence(actor: Actor, implementation_id: UUID, data: dict[str, Any]) -> Evidence:
    actor.require(Permission.CHANGE)
    implementation = _implementation(actor, implementation_id)
    fields: dict[str, Any] = {"kind": data["kind"], "title": data["title"].strip()}
    if data["kind"] == EvidenceKind.LINK:
        fields["url"] = data["url"]
    elif data["kind"] == EvidenceKind.REFERENCE:
        fields["referenced_implementation"] = _reference(actor, implementation, data)
    else:
        upload = _confirmed_upload(actor, data.get("upload_id"))
        upload.used = True
        upload.save(update_fields=["used"])
        fields |= {
            "file_name": upload.name,
            "file_size_bytes": upload.size_bytes,
            "file_content_type": upload.content_type,
            "file_key": upload.key,
        }
    evidence: Evidence = Evidence.objects.create(
        implementation=implementation, added_by_id=actor.user_id, added_at=timezone.now(), **fields
    )
    return evidence


def delete_evidence(actor: Actor, implementation_id: UUID, evidence_id: UUID) -> None:
    actor.require(Permission.CHANGE)
    implementation = _implementation(actor, implementation_id)
    evidence = Evidence.objects.filter(id=evidence_id, implementation=implementation).first()
    if evidence is None:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    key = evidence.file_key
    evidence.delete()
    if key:
        # Only once the deletion is committed; a rolled-back request keeps its file.
        transaction.on_commit(lambda: storage().delete(key))


def load_evidence(
    rows: list[dict[str, Any]],
    ids: dict[str, UUID],
    implementations: dict[str, UUID],
    users: dict[str, int],
) -> None:
    """Loads Evidence into the active Tenant. Demo files are listed but have no bytes."""
    for row in rows:
        file = row.get("file") or {}
        referenced = row.get("referenced_implementation_id")
        Evidence.objects.update_or_create(
            id=ids[row["id"]],
            defaults={
                "implementation_id": implementations[row["implementation_id"]],
                "kind": row["kind"],
                "title": row["title"],
                "file_name": file.get("name", ""),
                "file_size_bytes": file.get("size_bytes"),
                "file_content_type": file.get("content_type", ""),
                "url": row.get("url") or "",
                "referenced_implementation_id": implementations[referenced] if referenced else None,
                "added_by_id": users.get(row.get("added_by_id") or ""),
                "added_at": datetime.fromisoformat(row["added_at"]),
            },
        )


def _implementation(actor: Actor, implementation_id: UUID) -> Implementation:
    found: Implementation | None = Implementation.objects.filter(
        id=implementation_id,
        **({} if actor.scope_ids is None else {"scope_id__in": actor.scope_ids}),
    ).first()
    if found is None:
        raise Problem(status.HTTP_404_NOT_FOUND, "not_found", "Not found.")
    return found


def _reference(actor: Actor, implementation: Implementation, data: dict[str, Any]) -> Any:
    target = data.get("referenced_implementation_id")
    if target == implementation.id:
        raise FieldProblem([{"field": "referenced_implementation_id", "code": "self_reference"}])
    found = Implementation.objects.filter(id=target).first() if target else None
    if found is None:
        raise FieldProblem([{"field": "referenced_implementation_id", "code": "invalid_choice"}])
    return found


def _confirmed_upload(actor: Actor, upload_id: UUID | None) -> Upload:
    def fail(code: str) -> FieldProblem:
        return FieldProblem([{"field": "upload_id", "code": code}])

    if upload_id is None:
        raise fail("required")
    upload: Upload | None = Upload.objects.filter(
        id=upload_id, user_id=actor.user_id, used=False
    ).first()
    if upload is None:
        raise fail("invalid_choice")
    stored = storage().head(upload.key)
    if stored is None:
        raise fail("not_uploaded")
    if stored.size_bytes != upload.size_bytes:
        raise fail("size_mismatch")
    detected = _detect(storage().read_start(upload.key, 8))
    expected = "application/zip" if upload.content_type in OFFICE_TYPES else upload.content_type
    if stored.content_type != upload.content_type or detected != expected:
        raise fail("unsupported_type")
    return upload


def _detect(start: bytes) -> str | None:
    return next((kind for signature, kind in _SIGNATURES if start.startswith(signature)), None)
