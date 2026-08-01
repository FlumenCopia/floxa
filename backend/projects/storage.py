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
        return getattr(settings, "DEBUG", False)

    def _get_client(self):
        token_val = self._token or os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("VERCEL_BLOB_READ_WRITE_TOKEN")
        if token_val:
            return BlobClient(token=token_val)
        return BlobClient()

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

        client = self._get_client()
        try:
            blob = client.put(
                clean_name,
                raw_bytes,
                access="private",
                add_random_suffix=False,
                content_type=content_type,
            )
            return blob.pathname or clean_name
        except Exception as exc:
            logger.exception("VercelBlobStorage._save failed for %s: %s", clean_name, exc.__class__.__name__)
            raise OSError(f"Vercel Blob upload failed for {clean_name}") from exc
        finally:
            client.close()

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
        finally:
            client.close()

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
        finally:
            client.close()

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
        finally:
            client.close()

    def url(self, name):
        if not name:
            return ""
        clean_name = name.lstrip("/")
        if self.use_local:
            return self._local_storage.url(clean_name)
        return clean_name
