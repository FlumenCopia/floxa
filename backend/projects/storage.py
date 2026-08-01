import logging
import mimetypes
import os

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, Storage
from django.utils.deconstruct import deconstructible

from vercel.blob import BlobClient
from vercel.blob.errors import BlobError, BlobNotFoundError

logger = logging.getLogger(__name__)


import time

_PROCESS_BLOB_CLIENT = None


def get_shared_blob_client(token=None):
    global _PROCESS_BLOB_CLIENT
    if token:
        return BlobClient(token=token)
    if _PROCESS_BLOB_CLIENT is None:
        _PROCESS_BLOB_CLIENT = BlobClient()
    return _PROCESS_BLOB_CLIENT


@deconstructible
class VercelBlobStorage(Storage):
    """
    Custom Django Storage backend for Vercel Blob Object Storage using the official Vercel Python SDK.
    Uses Private Blob store (access="private") with ambient OIDC authentication in production.
    Uses FileSystemStorage ONLY when DEBUG=True in local development.
    """

    def __init__(self, token=None):
        self._token = token
        self._local_storage = FileSystemStorage()

    @property
    def use_local(self):
        if getattr(settings, "DEBUG", False):
            return True
        if not (
            os.environ.get("VERCEL")
            or os.environ.get("BLOB_READ_WRITE_TOKEN")
            or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN")
            or os.environ.get("VERCEL_OIDC_TOKEN")
            or self._token
        ):
            return True
        return False

    def _get_client(self):
        token_val = self._token or os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN")
        return get_shared_blob_client(token_val)

    def _save(self, name, content):
        if self.use_local:
            return self._local_storage._save(name, content)

        try:
            content.seek(0)
        except (AttributeError, OSError):
            pass
        raw_bytes = content.read()

        clean_name = name.lstrip("/")

        content_type, _ = mimetypes.guess_type(clean_name)
        if not content_type:
            content_type = getattr(content, "content_type", None) or "application/octet-stream"

        t_blob_start = time.perf_counter()
        client = self._get_client()
        try:
            blob = client.put(
                clean_name,
                raw_bytes,
                access="private",
                add_random_suffix=False,
                content_type=content_type,
            )
            t_blob_end = time.perf_counter()
            logger.info(
                "[Vercel Blob Storage Put Timing] pathname_len=%d, upload_bytes=%d, duration_ms=%.2f",
                len(clean_name),
                len(raw_bytes),
                round((t_blob_end - t_blob_start) * 1000, 2),
            )
            return blob.pathname or clean_name
        except Exception as exc:
            t_blob_end = time.perf_counter()
            logger.exception(
                "VercelBlobStorage._save failed for %s after %.2f ms: %s",
                clean_name,
                round((t_blob_end - t_blob_start) * 1000, 2),
                exc.__class__.__name__,
            )
            raise OSError(f"Vercel Blob upload failed for {clean_name}") from exc

    def _open(self, name, mode="rb"):
        if self.use_local:
            return self._local_storage._open(name, mode)

        clean_name = name.lstrip("/")
        client = self._get_client()
        try:
            res = client.get(clean_name, access="private")
            file_obj = ContentFile(res.content, name=clean_name)
            if res.content_type:
                file_obj.content_type = res.content_type
            return file_obj
        except BlobNotFoundError as exc:
            raise FileNotFoundError(f"Blob not found: {clean_name}") from exc
        except Exception as exc:
            logger.exception("VercelBlobStorage._open failed for %s: %s", clean_name, exc.__class__.__name__)
            raise OSError(f"Unable to fetch private blob object for {clean_name}") from exc

    def exists(self, name):
        if not name:
            return False
        if self.use_local:
            return self._local_storage.exists(name)

        clean_name = name.lstrip("/")
        client = self._get_client()
        try:
            client.head(clean_name)
            return True
        except (BlobNotFoundError, BlobError):
            return False
        except Exception:
            return False

    def size(self, name):
        if not name:
            return 0
        if self.use_local:
            try:
                return self._local_storage.size(name)
            except Exception:
                return 0

        clean_name = name.lstrip("/")
        client = self._get_client()
        try:
            res = client.head(clean_name)
            return int(getattr(res, "size", 0) or 0)
        except (BlobNotFoundError, BlobError):
            return 0
        except Exception as exc:
            logger.warning("VercelBlobStorage.size failed for %s: %s", clean_name, exc.__class__.__name__)
            return 0

    def delete(self, name):
        if not name:
            return
        if self.use_local:
            return self._local_storage.delete(name)

        clean_name = name.lstrip("/")
        client = self._get_client()
        try:
            client.delete(clean_name)
        except Exception as exc:
            logger.warning("VercelBlobStorage.delete failed for %s: %s", clean_name, exc.__class__.__name__)

    def url(self, name):
        if not name:
            return ""
        clean_name = name.lstrip("/")
        if self.use_local:
            return self._local_storage.url(clean_name)
        return clean_name
