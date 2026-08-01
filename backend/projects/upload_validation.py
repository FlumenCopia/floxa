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
        "max_size": 4 * MB,
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
        if rule_name == "moodboard_image":
            raise_upload_error(
                "File too large. Maximum size for server upload is 4 MB (larger files require direct Blob client upload).",
                field_name,
            )
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


import logging
import time

logger = logging.getLogger(__name__)


SKIP_REOPTIMIZE_MAX_BYTES = int(1.5 * 1024 * 1024)


def optimize_uploaded_image(file_obj, field_name=None):
    if not file_obj:
        return file_obj

    t_start = time.perf_counter()

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
    input_size = len(raw_bytes)

    t_decode_start = time.perf_counter()
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw_bytes)) as opened_image:
                image = ImageOps.exif_transpose(opened_image)
                image.load()
    except Image.DecompressionBombError:
        raise_upload_error("Image is too large to process safely.", field_name)
    except (Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError):
        raise_upload_error("Upload a valid image file.", field_name)

    t_decode_end = time.perf_counter()
    orig_w, orig_h = image.size
    decode_duration_ms = round((t_decode_end - t_decode_start) * 1000, 2)

    if (
        orig_w <= MAX_OPTIMIZED_IMAGE_EDGE
        and orig_h <= MAX_OPTIMIZED_IMAGE_EDGE
        and input_size <= SKIP_REOPTIMIZE_MAX_BYTES
    ):
        try:
            file_obj.seek(0)
        except (AttributeError, OSError):
            pass

        logger.info(
            "[Image Optimization Skipped] input_bytes=%d, dim=%dx%d, decode_ms=%.2f",
            input_size,
            orig_w,
            orig_h,
            decode_duration_ms,
        )
        return file_obj

    t_compress_start = time.perf_counter()

    if orig_w > MAX_OPTIMIZED_IMAGE_EDGE or orig_h > MAX_OPTIMIZED_IMAGE_EDGE:
        image.thumbnail(
            (MAX_OPTIMIZED_IMAGE_EDGE, MAX_OPTIMIZED_IMAGE_EDGE),
            Image.Resampling.LANCZOS,
        )

    out_w, out_h = image.size

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
            "progressive": True,
        }
    elif output_format == "PNG":
        save_kwargs = {}
    elif output_format == "WEBP":
        save_kwargs = {
            "quality": OPTIMIZED_IMAGE_QUALITY,
            "method": 1,
        }

    try:
        image.save(output, format=output_format, **save_kwargs)
    except OSError:
        raise_upload_error("Unable to process image file.", field_name)

    t_compress_end = time.perf_counter()
    compress_duration_ms = round((t_compress_end - t_compress_start) * 1000, 2)
    output_bytes = output.tell()

    logger.info(
        "[Image Optimization Timing] input_bytes=%d, output_bytes=%d, orig_dim=%dx%d, output_dim=%dx%d, decode_ms=%.2f, compress_ms=%.2f, total_opt_ms=%.2f",
        input_size,
        output_bytes,
        orig_w,
        orig_h,
        out_w,
        out_h,
        decode_duration_ms,
        compress_duration_ms,
        round((t_compress_end - t_start) * 1000, 2),
    )

    output_data = output.getvalue()
    optimized_file = ContentFile(output_data, name=original_name)
    optimized_file.content_type = IMAGE_MIME_TYPES_BY_FORMAT[output_format]
    return optimized_file


def raise_upload_error(message, field_name):
    if field_name:
        raise serializers.ValidationError({field_name: [message]})

    raise serializers.ValidationError(message)


MAX_CLIENT_PREVIEW_EDGE = 1400


def generate_client_preview_response(file_field, project=None):
    import re
    from django.http import HttpResponse
    from rest_framework import status
    from rest_framework.response import Response
    from PIL import ImageDraw, ImageFont

    if not file_field:
        return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        file_field.open("rb")
        raw_bytes = file_field.read()
    except (OSError, ValueError, AttributeError):
        return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)
    finally:
        try:
            file_field.close()
        except Exception:
            pass

    if not raw_bytes:
        return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw_bytes)) as opened_img:
                opened_img.verify()

            with Image.open(BytesIO(raw_bytes)) as opened_img:
                img = ImageOps.exif_transpose(opened_img)
                img.load()
                img = img.copy()
    except Exception:
        return Response({"detail": "Asset not found."}, status=status.HTTP_404_NOT_FOUND)

    width, height = img.size
    if width > MAX_CLIENT_PREVIEW_EDGE or height > MAX_CLIENT_PREVIEW_EDGE:
        img.thumbnail(
            (MAX_CLIENT_PREVIEW_EDGE, MAX_CLIENT_PREVIEW_EDGE),
            Image.Resampling.LANCZOS,
        )

    rgba_img = img.convert("RGBA")
    overlay = Image.new("RGBA", rgba_img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)

    watermark_text = "FLOXA PREVIEW"
    if project:
        company = getattr(project, "company_name", "") or ""
        if not company and hasattr(project, "client_profile"):
            try:
                company = project.client_profile.company_name or ""
            except Exception:
                company = ""
        company = re.sub(r"[\r\n\t]+", " ", str(company)).strip()
        if company:
            watermark_text = f"FLOXA PREVIEW • {company[:30]}"

    font = ImageFont.load_default()

    w_width, w_height = rgba_img.size
    step_x = max(240, w_width // 3)
    step_y = max(180, w_height // 3)

    for y in range(20, w_height, step_y):
        for x in range(20, w_width, step_x):
            offset = 50 if ((y // step_y) % 2 == 1) else 0
            pos_x = x + offset
            if pos_x < w_width:
                draw.text(
                    (pos_x, y),
                    watermark_text,
                    fill=(255, 255, 255, 95),
                    font=font,
                )
                draw.text(
                    (pos_x + 1, y + 1),
                    watermark_text,
                    fill=(0, 0, 0, 75),
                    font=font,
                )

    watermarked = Image.alpha_composite(rgba_img, overlay)

    final_img = Image.new("RGB", watermarked.size, (255, 255, 255))
    final_img.paste(watermarked, mask=watermarked.getchannel("A"))

    output = BytesIO()
    final_img.save(output, format="JPEG", quality=85, optimize=True)
    preview_bytes = output.getvalue()

    response = HttpResponse(preview_bytes, content_type="image/jpeg")
    response["Cache-Control"] = "private, no-store, max-age=0"
    response["Pragma"] = "no-cache"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = "inline"
    return response


def can_client_download_deliverable(project, deliverable):
    from .models import Deliverable, PaymentMilestone

    if not project or not deliverable:
        return False, "Deliverable unavailable."

    if getattr(project, "is_archived", False):
        return False, "Project is archived."

    if deliverable.project_id != project.id:
        return False, "Deliverable unavailable."

    if deliverable.status != Deliverable.Status.SHARED:
        return False, "Deliverable is not shared with client."

    milestones = list(project.payment_milestones.all())
    final_milestone = next((m for m in milestones if m.type == PaymentMilestone.Type.FINAL), None)

    if not final_milestone:
        return False, "Final files will be available after the required payment is confirmed."

    if final_milestone.status != PaymentMilestone.Status.PAID:
        return False, "Final files will be available after the required payment is confirmed."

    for milestone in milestones:
        if milestone.status != PaymentMilestone.Status.PAID:
            return False, "Final files will be available after the required payment is confirmed."

    return True, ""


