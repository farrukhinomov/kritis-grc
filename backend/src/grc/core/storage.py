"""The object store for Evidence files, behind one small interface.

This is the only module that talks to a storage vendor's SDK; everything else uses the
`Storage` protocol, so the platform runs against SeaweedFS locally, Cloudflare R2 in the
demo, or any other S3-compatible store without code changes. Browsers upload directly
to the store with a presigned PUT, so file bytes never pass through the application.
"""

from dataclasses import dataclass
from functools import cache
from typing import Any, Protocol

from django.conf import settings
from django.utils.module_loading import import_string
from rest_framework import status

from grc.core.problems import Problem


@dataclass(frozen=True)
class StoredObject:
    size_bytes: int
    content_type: str


class Storage(Protocol):
    def presign_put(self, key: str, content_type: str, size_bytes: int, expires_in: int) -> str:
        """A URL good for one PUT of exactly this type and size, until it expires."""

    def head(self, key: str) -> StoredObject | None: ...

    def read_start(self, key: str, length: int) -> bytes: ...

    def delete(self, key: str) -> None: ...


def storage() -> Storage:
    return _storage(settings.GRC_STORAGE)


@cache
def _storage(path: str) -> Storage:
    built: Storage = import_string(path)()
    return built


class S3Storage:
    def __init__(self) -> None:
        options: dict[str, Any] = settings.STORAGE
        if not options.get("bucket") or not options.get("endpoint_url"):
            raise Problem(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "service_unavailable",
                "File storage is not configured.",
            )
        import boto3
        from botocore.config import Config

        def client(endpoint: str) -> Any:
            return boto3.client(
                "s3",
                endpoint_url=endpoint,
                region_name=options["region"],
                aws_access_key_id=options["access_key_id"],
                aws_secret_access_key=options["secret_access_key"],
                config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
            )

        self.bucket: str = options["bucket"]
        # The server reaches the store on an internal address; browsers need the public one,
        # and a presigned URL is only valid for the host it was signed for.
        self.internal = client(options["endpoint_url"])
        self.public = client(options.get("public_endpoint_url") or options["endpoint_url"])

    def presign_put(self, key: str, content_type: str, size_bytes: int, expires_in: int) -> str:
        url: str = self.public.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": size_bytes,
            },
            ExpiresIn=expires_in,
        )
        return url

    def head(self, key: str) -> StoredObject | None:
        from botocore.exceptions import ClientError

        try:
            answer = self.internal.head_object(Bucket=self.bucket, Key=key)
        except ClientError:
            return None
        return StoredObject(answer["ContentLength"], answer.get("ContentType", ""))

    def read_start(self, key: str, length: int) -> bytes:
        answer = self.internal.get_object(
            Bucket=self.bucket, Key=key, Range=f"bytes=0-{length - 1}"
        )
        data: bytes = answer["Body"].read()
        return data

    def delete(self, key: str) -> None:
        self.internal.delete_object(Bucket=self.bucket, Key=key)
