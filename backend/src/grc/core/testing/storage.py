"""An in-memory object store with the real adapter's interface."""

from typing import ClassVar

from grc.core.storage import StoredObject


class MemoryStorage:
    # Shared by every instance, as one real bucket is: the app's adapter and the test's
    # simulated browser upload must see the same objects.
    objects: ClassVar[dict[str, tuple[bytes, str]]] = {}
    deleted: ClassVar[list[str]] = []

    def presign_put(self, key: str, content_type: str, size_bytes: int, expires_in: int) -> str:
        return f"https://storage.test/{key}?expires={expires_in}"

    def head(self, key: str) -> StoredObject | None:
        found = self.objects.get(key)
        return StoredObject(len(found[0]), found[1]) if found else None

    def read_start(self, key: str, length: int) -> bytes:
        return self.objects[key][0][:length]

    def delete(self, key: str) -> None:
        self.objects.pop(key, None)
        self.deleted.append(key)

    def delete_prefix(self, prefix: str) -> int:
        if not prefix.endswith("/"):
            raise ValueError("A prefix to delete must end with '/'.")
        keys = [key for key in self.objects if key.startswith(prefix)]
        for key in keys:
            self.delete(key)
        return len(keys)

    @classmethod
    def put(cls, key: str, data: bytes, content_type: str) -> None:
        """What a browser's PUT to the presigned URL would store."""
        cls.objects[key] = (data, content_type)

    @classmethod
    def reset(cls) -> None:
        cls.objects.clear()
        cls.deleted.clear()
