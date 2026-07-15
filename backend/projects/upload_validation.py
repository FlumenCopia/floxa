from pathlib import Path
from mimetypes import guess_type

from rest_framework import serializers


MB = 1024 * 1024

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

PDF_EXTENSIONS = {".pdf"}
PDF_MIME_TYPES = {"application/pdf"}

DOCUMENT_EXTENSIONS = {
    ".doc",
    ".docx",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".webp",
    ".zip",
}
DOCUMENT_MIME_TYPES = {
    "application/msword",
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "image/jpeg",
    "image/png",
    "image/webp",
}


UPLOAD_RULES = {
    "moodboard_image": {
        "max_size": 5 * MB,
        "extensions": IMAGE_EXTENSIONS,
        "mime_types": IMAGE_MIME_TYPES,
    },
    "concept_image": {
        "max_size": 5 * MB,
        "extensions": IMAGE_EXTENSIONS,
        "mime_types": IMAGE_MIME_TYPES,
    },
    "concept_file": {
        "max_size": 10 * MB,
        "extensions": DOCUMENT_EXTENSIONS,
        "mime_types": DOCUMENT_MIME_TYPES,
    },
    "agreement_file": {
        "max_size": 5 * MB,
        "extensions": PDF_EXTENSIONS,
        "mime_types": PDF_MIME_TYPES,
    },
    "deliverable_file": {
        "max_size": 20 * MB,
        "extensions": DOCUMENT_EXTENSIONS,
        "mime_types": DOCUMENT_MIME_TYPES,
    },
}


def validate_upload_file(file_obj, rule_name, field_name=None):
    if not file_obj:
        return

    rule = UPLOAD_RULES[rule_name]
    max_size = rule["max_size"]

    if file_obj.size > max_size:
        raise_upload_error("File too large.", field_name)

    extension = Path(file_obj.name).suffix.lower()
    if extension not in rule["extensions"]:
        raise_upload_error("Unsupported file type.", field_name)

    upload_mime_type = (getattr(file_obj, "content_type", "") or "").lower()
    guessed_mime_type = (guess_type(file_obj.name)[0] or "").lower()
    allowed_mime_types = rule["mime_types"]

    if (
        upload_mime_type not in allowed_mime_types
        and guessed_mime_type not in allowed_mime_types
    ):
        raise_upload_error("Unsupported file type.", field_name)


def raise_upload_error(message, field_name):
    if field_name:
        raise serializers.ValidationError({field_name: [message]})

    raise serializers.ValidationError(message)
