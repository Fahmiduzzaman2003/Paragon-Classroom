"""Storage backend interface.

A ``Storage`` produces a ``StoredFile`` for every upload. ``StoredFile.url``
is what gets saved in the database — for local storage it's a relative
``/uploads/<path>`` that FastAPI serves via ``StaticFiles``, for Cloudinary
it's the absolute ``https://res.cloudinary.com/...`` URL.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import AsyncIterator, Protocol

import httpx

from ...config import settings

log = logging.getLogger(__name__)


@dataclass
class StoredFile:
    """The persistence result for an uploaded file."""

    # Where the file lives:
    url: str
    # Backend-specific storage key (relative path for local, public_id for cloudinary).
    key: str
    # Bytes written — useful for Material.size and quota tracking.
    size: int
    # MIME type as detected at upload time.
    mime: str
    # Which backend produced this StoredFile. UI can show a small badge if it cares.
    backend: str


class Storage(Protocol):
    backend_name: str

    async def save(
        self,
        *,
        stream: AsyncIterator[bytes],
        filename: str,
        mime: str,
        folder: str = "",
        key_hint: str | None = None,
    ) -> StoredFile:
        ...

    async def delete(self, url_or_key: str) -> None:
        """Best-effort delete. Swallows errors for backends that can't
        (e.g. Cloudinary unsigned uploads have no delete scope)."""
        ...


# ─────────────────────────────────────────────────────────────────────────────
# Local-disk backend
# ─────────────────────────────────────────────────────────────────────────────
class LocalStorage:
    """Writes files under ``settings.uploads_dir / <folder>``. Returns a
    relative URL served by the FastAPI ``/uploads`` mount."""

    backend_name = "local"

    def __init__(self, root):
        self.root = root

    async def save(self, *, stream, filename, mime, folder="", key_hint=None):
        import uuid
        from pathlib import Path

        safe = Path(filename).name  # strip any directory traversal
        target_dir = self.root / folder if folder else self.root
        target_dir.mkdir(parents=True, exist_ok=True)
        prefix = key_hint or str(uuid.uuid4())
        key = f"{prefix}__{safe}"
        target = target_dir / key
        size = 0
        with target.open("wb") as f:
            async for chunk in stream:
                if not chunk:
                    break
                f.write(chunk)
                size += len(chunk)
        # ``url`` is what we store on Material.path — the frontend resolves
        # it through the same /uploads mount.
        url = f"/uploads/{folder}/{key}" if folder else f"/uploads/{key}"
        return StoredFile(url=url, key=str(target), size=size, mime=mime, backend=self.backend_name)

    async def delete(self, url_or_key: str) -> None:
        """Accepts either the public ``/uploads/...`` url or the absolute
        path returned as ``StoredFile.key``."""
        from pathlib import Path

        if not url_or_key:
            return
        try:
            if url_or_key.startswith("/uploads/"):
                rel = url_or_key[len("/uploads/"):]
                target = self.root / rel
            else:
                target = Path(url_or_key)
            target.unlink(missing_ok=True)
        except OSError:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# Cloudinary backend
# ─────────────────────────────────────────────────────────────────────────────
class CloudinaryStorage:
    """Streams the file to Cloudinary using an unsigned upload preset.

    For free-tier Render deployments this is the only way to keep uploads
    alive across deploys — Render's disk is ephemeral and wipes on every
    redeploy. With Cloudinary, ``Material.path`` becomes the absolute
    ``secure_url`` and nothing needs to be re-fetched or re-served.
    """

    backend_name = "cloudinary"

    def __init__(self, *, cloud_name: str, upload_preset: str, folder: str = "paragon"):
        if not cloud_name or not upload_preset:
            raise RuntimeError(
                "STORAGE_BACKEND=cloudinary requires CLOUDINARY_CLOUD_NAME and "
                "CLOUDINARY_UPLOAD_PRESET in the environment."
            )
        self.cloud_name = cloud_name
        self.upload_preset = upload_preset
        self.folder = folder
        self._endpoint = f"https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload"

    async def save(self, *, stream, filename, mime, folder="", key_hint=None):
        # Cloudinary unsigned upload requires multipart/form-data with two
        # fields: the file and the upload_preset. We can't pipe a generator
        # through httpx without buffering, so we read fully here. Cap is
        # 40 MB (matching MAX_UPLOAD_BYTES in utils.file_parsers) — anything
        # larger gets rejected before we waste bandwidth.
        from ...utils.file_parsers import MAX_UPLOAD_BYTES

        chunks: list[bytes] = []
        size = 0
        async for chunk in stream:
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise ValueError(f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")
            chunks.append(chunk)
        body = b"".join(chunks)

        subfolder = f"{self.folder}/{folder}" if folder else self.folder
        data = {
            "upload_preset": self.upload_preset,
            "folder": subfolder,
            "resource_type": "auto",
        }
        if key_hint:
            # public_id is what Cloudinary uses to derive the URL. Setting
            # it makes filenames stable so you can grep the Cloudinary
            # dashboard by your app-side id.
            data["public_id"] = key_hint
        files = {"file": (filename, body, mime or "application/octet-stream")}

        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(self._endpoint, data=data, files=files)
        if r.status_code >= 300:
            # Surface the actual Cloudinary error — usually a misconfigured preset.
            try:
                detail = r.json().get("error", {}).get("message") or r.text
            except Exception:
                detail = r.text
            raise RuntimeError(f"Cloudinary upload failed: {detail}")
        payload = r.json()
        secure_url = payload.get("secure_url") or payload.get("url")
        public_id = payload.get("public_id", "")
        if not secure_url:
            raise RuntimeError("Cloudinary returned no URL")
        return StoredFile(
            url=secure_url,
            key=public_id,
            size=size,
            mime=mime,
            backend=self.backend_name,
        )

    async def delete(self, url_or_key: str) -> None:
        """Unsigned upload presets don't grant destroy scope, so we don't
        have an API key to call the destroy endpoint with. Log and move on
        — orphaned Cloudinary assets can be cleaned up from the Cloudinary
        dashboard or with a scheduled job using a signed preset."""
        log.info("CloudinaryStorage.delete: skipping %s (no signed creds)", url_or_key)


# ─────────────────────────────────────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────────────────────────────────────
_storage: Storage | None = None


def get_storage() -> Storage:
    """Lazy singleton. Honors ``STORAGE_BACKEND`` (local | cloudinary)."""
    global _storage
    if _storage is not None:
        return _storage

    backend = (settings.storage_backend or "").strip().lower()
    if not backend:
        # Sensible defaults: dev → local; prod → cloudinary.
        backend = "local" if settings.app_env == "development" else "cloudinary"

    if backend == "local":
        log.info("Storage backend: local (%s)", settings.uploads_dir)
        _storage = LocalStorage(settings.uploads_dir)
    elif backend == "cloudinary":
        log.info(
            "Storage backend: cloudinary (cloud=%s, preset=%s)",
            settings.cloudinary_cloud_name,
            settings.cloudinary_upload_preset,
        )
        _storage = CloudinaryStorage(
            cloud_name=settings.cloudinary_cloud_name,
            upload_preset=settings.cloudinary_upload_preset,
            folder=settings.cloudinary_folder,
        )
    else:
        raise RuntimeError(f"Unknown STORAGE_BACKEND={backend!r}. Use 'local' or 'cloudinary'.")
    return _storage


def reset_storage_for_tests() -> None:
    """For pytest — drop the cached singleton between tests."""
    global _storage
    _storage = None