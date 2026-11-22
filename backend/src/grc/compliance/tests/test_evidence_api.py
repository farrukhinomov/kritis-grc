import json
from collections import Counter
from http import HTTPStatus
from io import StringIO
from typing import Any

import pytest
from django.conf import settings
from django.core.management import call_command
from django.test import Client
from pytest_django.fixtures import Settings

from grc.core.storage import S3Storage
from grc.core.testing.storage import MemoryStorage

pytestmark = pytest.mark.django_db

TENANT = "/api/v1/tenants/muster-stadtwerke"
PDF = b"%PDF-1.7\n" + b"x" * 100


@pytest.fixture
def manager(settings: Settings) -> Client:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    client = Client()
    client.post("/api/v1/auth/demo-login", {"role": "grc_manager"}, content_type="application/json")
    return client


def _implementations(client: Client) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = client.get(f"{TENANT}/implementations?limit=100").json()["items"]
    return items


def _post(client: Client, path: str, body: Any, key: str | None = None) -> Any:
    headers = {"Idempotency-Key": key} if key else {}
    return client.post(
        f"{TENANT}/{path}", json.dumps(body), content_type="application/json", headers=headers
    )


def _upload(client: Client, data: bytes = PDF, content_type: str = "application/pdf") -> str:
    slot = _post(
        client,
        "uploads",
        {"name": "plan.pdf", "size_bytes": len(data), "content_type": "application/pdf"},
    ).json()
    key = slot["upload_url"].split("storage.test/")[1].split("?")[0]
    MemoryStorage.put(key, data, content_type)
    upload_id: str = slot["upload_id"]
    return upload_id


def test_evidence_matches_the_prototype(manager: Client) -> None:
    fixture = json.loads((settings.SEED_DIR / "evidence.json").read_text(encoding="utf-8"))
    kinds = Counter[str]()

    for implementation in _implementations(manager):
        page = manager.get(f"{TENANT}/implementations/{implementation['id']}/evidence").json()
        kinds.update(e["kind"] for e in page["items"])

    assert kinds == Counter(e["kind"] for e in fixture)


def test_a_link_is_attached(manager: Client) -> None:
    target = _implementations(manager)[0]

    response = _post(
        manager,
        f"implementations/{target['id']}/evidence",
        {"kind": "link", "title": " Richtlinie ", "url": "https://example.org/policy"},
    )

    evidence = response.json()
    assert response.status_code == HTTPStatus.CREATED
    assert (evidence["title"], evidence["url"], evidence["file"]) == (
        "Richtlinie",
        "https://example.org/policy",
        None,
    )


def test_a_reference_points_to_other_work(manager: Client) -> None:
    first, second = _implementations(manager)[:2]
    path = f"implementations/{first['id']}/evidence"

    ok = _post(
        manager,
        path,
        {"kind": "reference", "title": "BSIG", "referenced_implementation_id": second["id"]},
    )
    itself = _post(
        manager,
        path,
        {"kind": "reference", "title": "Self", "referenced_implementation_id": first["id"]},
    )
    unknown = _post(
        manager,
        path,
        {
            "kind": "reference",
            "title": "Nothing",
            "referenced_implementation_id": "00000000-0000-4000-8000-000000000000",
        },
    )

    assert ok.json()["referenced_implementation_id"] == second["id"]
    assert itself.json()["errors"] == [
        {"field": "referenced_implementation_id", "code": "self_reference"}
    ]
    assert unknown.json()["errors"] == [
        {"field": "referenced_implementation_id", "code": "invalid_choice"}
    ]


def test_a_file_is_attached_after_its_upload_is_checked(manager: Client) -> None:
    target = _implementations(manager)[0]
    upload_id = _upload(manager)

    response = _post(
        manager,
        f"implementations/{target['id']}/evidence",
        {"kind": "file", "title": "Notfallplan", "upload_id": upload_id},
    )
    reused = _post(
        manager,
        f"implementations/{target['id']}/evidence",
        {"kind": "file", "title": "Again", "upload_id": upload_id},
    )

    assert response.status_code == HTTPStatus.CREATED
    assert response.json()["file"] == {
        "name": "plan.pdf",
        "size_bytes": len(PDF),
        "content_type": "application/pdf",
    }
    assert reused.json()["errors"] == [{"field": "upload_id", "code": "invalid_choice"}]


@pytest.mark.parametrize(
    ("stored", "code"),
    [
        (None, "not_uploaded"),
        ((PDF + b"more", "application/pdf"), "size_mismatch"),
        ((b"<html>" + b"x" * (len(PDF) - 6), "application/pdf"), "unsupported_type"),
        ((PDF, "text/html"), "unsupported_type"),
    ],
)
def test_what_arrived_must_match_the_announcement(
    manager: Client, stored: tuple[bytes, str] | None, code: str
) -> None:
    target = _implementations(manager)[0]
    slot = _post(
        manager,
        "uploads",
        {"name": "plan.pdf", "size_bytes": len(PDF), "content_type": "application/pdf"},
    ).json()
    if stored is not None:
        key = slot["upload_url"].split("storage.test/")[1].split("?")[0]
        MemoryStorage.put(key, *stored)

    response = _post(
        manager,
        f"implementations/{target['id']}/evidence",
        {"kind": "file", "title": "Plan", "upload_id": slot["upload_id"]},
    )

    assert response.json()["errors"] == [{"field": "upload_id", "code": code}]


@pytest.mark.parametrize(
    ("announced", "code"),
    [
        ({"name": "x.pdf", "size_bytes": 0, "content_type": "application/pdf"}, "invalid_size"),
        (
            {"name": "x.pdf", "size_bytes": 21 * 1024 * 1024, "content_type": "application/pdf"},
            "invalid_size",
        ),
        (
            {"name": "x.exe", "size_bytes": 10, "content_type": "application/x-msdownload"},
            "unsupported_type",
        ),
        ({"size_bytes": 10, "content_type": "application/pdf"}, "required"),
    ],
)
def test_uploads_are_checked_before_a_url_is_issued(
    manager: Client, announced: dict[str, Any], code: str
) -> None:
    response = _post(manager, "uploads", announced)

    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.json()["errors"] == [{"field": "file", "code": code}]


def test_invalid_evidence_is_explained(manager: Client) -> None:
    path = f"implementations/{_implementations(manager)[0]['id']}/evidence"

    no_url = _post(manager, path, {"kind": "link", "title": "Link"})
    no_kind = _post(manager, path, {"kind": "paper", "title": ""})
    no_upload = _post(manager, path, {"kind": "file", "title": "File"})

    assert {"field": "url", "code": "invalid_url"} in no_url.json()["errors"]
    assert {"field": "kind", "code": "invalid_choice"} in no_kind.json()["errors"]
    assert {"field": "title", "code": "required"} in no_kind.json()["errors"]
    assert no_upload.json()["errors"] == [{"field": "upload_id", "code": "required"}]


def test_a_retry_with_the_same_key_attaches_once(manager: Client) -> None:
    target = _implementations(manager)[0]
    path = f"implementations/{target['id']}/evidence"
    body = {"kind": "link", "title": "Policy", "url": "https://example.org"}

    first = _post(manager, path, body, key="ev-1")
    again = _post(manager, path, body, key="ev-1")

    assert again.json() == first.json()
    titles = [e["title"] for e in manager.get(f"{TENANT}/{path}").json()["items"]]
    assert titles.count("Policy") == 1


def test_removing_file_evidence_deletes_the_file_once_committed(
    manager: Client, django_capture_on_commit_callbacks: Any
) -> None:
    target = _implementations(manager)[0]
    path = f"implementations/{target['id']}/evidence"
    created = _post(manager, path, {"kind": "file", "title": "F", "upload_id": _upload(manager)})

    with django_capture_on_commit_callbacks(execute=True):
        response = manager.delete(f"{TENANT}/{path}/{created.json()['id']}")

    assert response.status_code == HTTPStatus.NO_CONTENT
    assert len(MemoryStorage.deleted) == 1
    assert manager.delete(f"{TENANT}/{path}/{created.json()['id']}").status_code == 404


def test_an_auditor_can_read_but_not_attach(settings: Settings) -> None:
    settings.DEMO_LOGIN_ENABLED = True
    call_command("seed_demo", stdout=StringIO())
    auditor = Client()
    auditor.post("/api/v1/auth/demo-login", {"role": "auditor"}, content_type="application/json")
    target = _implementations(auditor)[0]
    path = f"implementations/{target['id']}/evidence"

    assert auditor.get(f"{TENANT}/{path}").status_code == HTTPStatus.OK
    assert (
        _post(auditor, path, {"kind": "link", "title": "x", "url": "https://e.org"}).status_code
        == 403
    )


def test_without_configured_storage_uploads_are_unavailable(settings: Settings) -> None:
    settings.STORAGE = {"bucket": None, "endpoint_url": None}

    with pytest.raises(Exception, match="not configured"):
        S3Storage()


def test_the_s3_adapter_signs_one_put_of_the_announced_type_and_size(
    settings: Settings,
) -> None:
    settings.STORAGE = {
        "endpoint_url": "http://storage.internal:8333",
        "public_endpoint_url": "https://files.example.org",
        "bucket": "evidence",
        "region": "auto",
        "access_key_id": "test-key",
        "secret_access_key": "test-secret",
    }

    url = S3Storage().presign_put("tenants/t/uploads/u", "application/pdf", 1234, 300)

    assert url.startswith("https://files.example.org/evidence/tenants/t/uploads/u?")
    assert "X-Amz-Expires=300" in url
    assert "content-length" in url.lower()
    assert "content-type" in url.lower()
