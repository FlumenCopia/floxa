from io import BytesIO
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image

from accounts.models import Consultant
from projects.models import Client, Moodboard, Project, ProjectActivity
from projects.upload_validation import optimize_uploaded_image, validate_upload_file


class UploadPerformanceAndSafetyTests(TestCase):
    def setUp(self):
        self.consultant = Consultant.objects.create_user(
            email="upload_tester@example.com",
            password="testpassword123",
            name="Upload Tester",
        )
        self.client_obj = Client.objects.create(
            name="Test Client",
            email="upload_client@example.com",
            company_name="Test Corp",
            sector="Technology",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            title="Upload Test Project",
            company_name="Upload Corp",
        )

    def create_test_image(self, width, height, format="JPEG", mode="RGB"):
        buf = BytesIO()
        img = Image.new(mode, (width, height), color=(200, 100, 50))
        img.save(buf, format=format)
        buf.seek(0)
        ext = ".jpg" if format == "JPEG" else f".{format.lower()}"
        mime = f"image/{format.lower()}" if format != "JPEG" else "image/jpeg"
        return SimpleUploadedFile(f"test_image{ext}", buf.getvalue(), content_type=mime)

    def test_small_jpg_skips_unnecessary_reencoding(self):
        small_file = self.create_test_image(500, 500, format="JPEG")
        optimized = optimize_uploaded_image(small_file)

        self.assertEqual(optimized, small_file, "Small JPG under thresholds must skip re-encoding")

    def test_large_jpg_resized_to_max_edge(self):
        large_file = self.create_test_image(2400, 1800, format="JPEG")
        optimized = optimize_uploaded_image(large_file)

        self.assertNotEqual(optimized, large_file)
        with Image.open(BytesIO(optimized.read())) as result_img:
            w, h = result_img.size
            self.assertLessEqual(max(w, h), 1600, "Resized image max edge must be <= 1600")

    def test_transparent_png_remains_transparent(self):
        png_file = self.create_test_image(2000, 2000, format="PNG", mode="RGBA")
        optimized = optimize_uploaded_image(png_file)

        with Image.open(BytesIO(optimized.read())) as result_img:
            self.assertIn(result_img.mode, ("RGBA", "P", "LA"))

    def test_webp_support(self):
        webp_file = self.create_test_image(1200, 800, format="WEBP")
        optimized = optimize_uploaded_image(webp_file)
        self.assertIsNotNone(optimized)

    def test_pdf_upload_does_not_invoke_pillow(self):
        pdf_file = SimpleUploadedFile("sample.pdf", b"%PDF-1.4 test content", content_type="application/pdf")
        with patch("PIL.Image.open") as mock_pillow_open:
            validate_upload_file(pdf_file, "agreement_file", "file")
            mock_pillow_open.assert_not_called()

    def test_oversized_file_rejected_before_storage(self):
        huge_file = SimpleUploadedFile("huge.jpg", b"0" * (10 * 1024 * 1024), content_type="image/jpeg")
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            validate_upload_file(huge_file, "moodboard_image", "image")

    def test_single_storage_save_and_activity_creation(self):
        image_file = self.create_test_image(800, 800, format="JPEG")

        with patch("django.core.files.storage.default_storage._save", return_value="moodboards/test.jpg") as mock_save, \
             patch("django.core.files.storage.default_storage.exists", return_value=True):

            moodboard = Moodboard.objects.create(
                project=self.project,
                title="Test Moodboard",
                image=image_file,
            )
            ProjectActivity.create(
                project=self.project,
                consultant=self.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="moodboard_uploaded",
                description="Uploaded moodboard",
            )

            self.assertEqual(mock_save.call_count, 1, "Exactly one storage save must occur")
            self.assertEqual(Moodboard.objects.filter(project=self.project).count(), 1)
            self.assertEqual(ProjectActivity.objects.filter(project=self.project).count(), 1)
