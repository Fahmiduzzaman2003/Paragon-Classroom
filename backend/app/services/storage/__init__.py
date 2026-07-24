"""Storage abstraction.

Two backends:

* **local** — files are written under ``settings.uploads_dir``. Fine for
  development on a laptop; **does not survive on Render free tier** because
  the disk is ephemeral.

* **cloudinary** — files are streamed directly to Cloudinary via their
  unsigned-upload API. URLs are persisted in the database, so the file is
  reachable from any number of web workers and survives deploys.

The backend is chosen by the ``STORAGE_BACKEND`` env var. When unset, we
default to ``local`` in ``APP_ENV=development`` and ``cloudinary`` in
``production`` — so prod-by-default forces you to configure Cloudinary.
"""

from .backend import StoredFile, Storage, get_storage

__all__ = ["StoredFile", "Storage", "get_storage"]
