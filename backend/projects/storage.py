import json
import logging
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, Storage
from django.utils.deconstruct import deconstructible

logger = logging.getLogger(__name__)


@deconstructible
class VercelBlobStorage(Storage):
    """
    Custom Django Storage backend for Vercel Blob Object Storage.
    Supports persistent uploads, reads, existence checks, URLs, and deletions.
    Uses FileSystemStorage ONLY when DEBUG=True in local development.
    In production (DEBUG=False), requires BLOB_READ_WRITE_TOKEN / VERCEL_BLOB_READ_WRITE_TOKEN.
    """

    def __init__(self, token=None, storage_url_prefix=None):
        self._token = token
        self._storage_url_prefix = storage_url_prefix
        self._local_storage = FileSystemStorage()

    @property
    def token(self):
        if self._token:
            return self._token

        val = (
            os.environ.get("BLOB_READ_WRITE_TOKEN")
            or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN")
            or getattr(settings, "BLOB_READ_WRITE_TOKEN", "")
        )

        if not val and not getattr(settings, "DEBUG", False):
            raise ImproperlyConfigured(
                "Vercel Blob token (BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN) is not configured in production."
            )

        return val

    @property
    def use_local(self):
        return getattr(settings, "DEBUG", False)

    def _get_blob_url(self, name):
        if name.startswith("http://") or name.startswith("https://"):
            return name
        clean_name = name.lstrip("/")
        prefix = (
            self._storage_url_prefix
            or os.environ.get("BLOB_STORAGE_URL_PREFIX", "")
            or getattr(settings, "BLOB_STORAGE_URL_PREFIX", "")
        )
        if prefix:
            return f"{prefix.rstrip('/')}/{clean_name}"
        return f"https://public.blob.vercel-storage.com/{clean_name}"

    def _save(self, name, content):
        if self.use_local:
            return self._local_storage._save(name, content)

        auth_token = self.token

        try:
            content.seek(0)
        except (AttributeError, OSError):
            pass
        raw_bytes = content.read()

        clean_name = name.lstrip("/")
        api_url = f"https://blob.vercel-storage.com/{clean_name}"

        req = urllib.request.Request(
            api_url,
            data=raw_bytes,
            headers={
                "Authorization": f"Bearer {auth_token}",
                "x-api-version": "7",
                "x-access": "public",
                "x-add-random-suffix": "0",
            },
            method="PUT",
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                return resp_data.get("url") or resp_data.get("pathname") or clean_name
        except urllib.error.HTTPError as exc:
            err_body = ""
            try:
                err_body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            logger.exception(
                "VercelBlobStorage HTTPError %s: %s | Response Body: %s",
                exc.code,
                exc.reason,
                err_body,
            )
            raise OSError(f"Vercel Blob HTTPError {exc.code}: {exc.reason} - {err_body}") from exc
        except Exception as exc:
            logger.exception(
                "VercelBlobStorage upload failed: exception_class=%s",
                exc.__class__.__name__,
            )
            raise OSError(f"Vercel Blob upload failed for {name}: {exc}") from exc

    def _open(self, name, mode="rb"):
        if self.use_local:
            return self._local_storage._open(name, mode)

        url = self.url(name)
        req = urllib.request.Request(url, headers={"User-Agent": "Floxa-Backend/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return ContentFile(resp.read(), name=name)
        except Exception as exc:
            raise OSError(f"Unable to open blob at {url}") from exc

    def exists(self, name):
        if self.use_local:
            return self._local_storage.exists(name)

        url = self.url(name)
        req = urllib.request.Request(url, method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200
        except Exception:
            return False

    def delete(self, name):
        if not name:
            return
        if self.use_local:
            return self._local_storage.delete(name)

        url = self.url(name)
        api_url = "https://blob.vercel-storage.com/delete"
        payload = json.dumps({"urls": [url]}).encode("utf-8")
        req = urllib.request.Request(
            api_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.token}",
                "x-api-version": "7",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                pass
        except Exception:
            pass

    def url(self, name):
        if not name:
            return ""
        if name.startswith("http://") or name.startswith("https://"):
            return name
        if self.use_local:
            return self._local_storage.url(name)
        return self._get_blob_url(name)
