from io import BytesIO
from mimetypes import guess_type
from pathlib import Path
import warnings

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers


MB = 1024 * 1024
MAX_OPTIMIZED_IMAGE_EDGE = 1600
OPTIMIZED_IMAGE_QUALITY = 82

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_MIME_TYPES_BY_FORMAT = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}

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


def optimize_uploaded_image(file_obj, field_name=None):
    if not file_obj:
        return file_obj

    original_name = Path(file_obj.name).name
    extension = Path(original_name).suffix.lower()
    output_format = {
        ".jpg": "JPEG",
        ".jpeg": "JPEG",
        ".png": "PNG",
        ".webp": "WEBP",
    }.get(extension)

    if output_format is None:
        raise_upload_error("Unsupported file type.", field_name)

    try:
        file_obj.seek(0)
    except (AttributeError, OSError):
        pass

    raw_bytes = file_obj.read()

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw_bytes)) as opened_image:
                opened_image.verify()

            with Image.open(BytesIO(raw_bytes)) as opened_image:
                image = ImageOps.exif_transpose(opened_image)
                image.load()
                image = image.copy()
    except Image.DecompressionBombError:
        raise_upload_error("Image is too large to process safely.", field_name)
    except (Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError):
        raise_upload_error("Upload a valid image file.", field_name)

    image.thumbnail(
        (MAX_OPTIMIZED_IMAGE_EDGE, MAX_OPTIMIZED_IMAGE_EDGE),
        Image.Resampling.LANCZOS,
    )

    output = BytesIO()
    save_kwargs = {}

    if output_format == "JPEG":
        if image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        ):
            background = Image.new("RGB", image.size, (255, 255, 255))
            alpha = image.convert("RGBA").getchannel("A")
            background.paste(image.convert("RGBA"), mask=alpha)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        save_kwargs = {
            "quality": OPTIMIZED_IMAGE_QUALITY,
            "optimize": True,
            "progressive": True,
        }
    elif output_format == "PNG":
        save_kwargs = {"optimize": True}
    elif output_format == "WEBP":
        save_kwargs = {
            "quality": OPTIMIZED_IMAGE_QUALITY,
            "method": 6,
        }

    try:
        image.save(output, format=output_format, **save_kwargs)
    except OSError:
        raise_upload_error("Unable to process image file.", field_name)

    optimized_file = ContentFile(output.getvalue(), name=original_name)
    optimized_file.content_type = IMAGE_MIME_TYPES_BY_FORMAT[output_format]
    return optimized_file


def raise_upload_error(message, field_name):
    if field_name:
        raise serializers.ValidationError({field_name: [message]})

    raise serializers.ValidationError(message)
