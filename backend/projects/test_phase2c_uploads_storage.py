import uuid
from io import BytesIO
from decimal import Decimal
from PIL import Image

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import (
    Client,
    Project,
    Concept,
    Deliverable,
    PaymentMilestone,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    sign_portal_access_token,
)

User = get_user_model()


class Phase2CUploadsAndStorageValidationTests(TestCase):
    """
    Dedicated test suite for Phase 2C:
    Verifies upload file validation, image/pdf magic byte inspection,
    deliverable download gating, and storage authorization boundaries.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant_a = User.objects.create_user(
            email="consultant_a_upload@floxa.test",
            name="Alice UploadConsultant",
            password="StrongPassword123!",
        )
        self.consultant_b = User.objects.create_user(
            email="consultant_b_upload@floxa.test",
            name="Bob UploadConsultant",
            password="StrongPassword123!",
        )

        self.client_record = Client.objects.create(
            name="Upload Client",
            email="client@upload.test",
            company_name="Upload Corp",
            sector="Design",
        )
        self.project = Project.objects.create(
            consultant=self.consultant_a,
            client=self.client_record,
            title="Upload Project",
            company_name="Upload Corp",
            sector="Design",
            project_value=Decimal("100000.00"),
            portal_token=uuid.uuid4(),
            status=Project.Status.CREATED,
        )

        # Initialize Payment Milestones with percentage
        self.milestone_adv = PaymentMilestone.objects.create(
            project=self.project,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=50,
            status=PaymentMilestone.Status.PAID,
        )
        self.milestone_mid = PaymentMilestone.objects.create(
            project=self.project,
            type=PaymentMilestone.Type.MID,
            percentage=25,
            status=PaymentMilestone.Status.PAID,
        )
        self.milestone_final = PaymentMilestone.objects.create(
            project=self.project,
            type=PaymentMilestone.Type.FINAL,
            percentage=25,
            status=PaymentMilestone.Status.READY,  # Not paid yet!
        )

    def get_authenticated_client_portal(self):
        portal_client = APIClient()
        cookie_val = sign_portal_access_token(self.project.portal_token)
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val
        portal_client.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=str(self.project.portal_token))
        return portal_client

    def generate_valid_png(self):
        img_io = BytesIO()
        img = Image.new("RGB", (100, 100), color="purple")
        img.save(img_io, format="PNG")
        return SimpleUploadedFile("concept.png", img_io.getvalue(), content_type="image/png")

    def test_01_valid_image_concept_upload_succeeds(self):
        """Verify uploading a valid PNG image for a concept succeeds."""
        self.client.force_authenticate(user=self.consultant_a)

        valid_img = self.generate_valid_png()
        res = self.client.post(
            reverse("project-concepts", kwargs={"project_id": self.project.id}),
            {"title": "Valid Concept", "description": "Good image", "image": valid_img},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("id", res.data)

    def test_02_fake_image_upload_rejected(self):
        """Verify uploading a text file renamed to .png is rejected by image validation."""
        self.client.force_authenticate(user=self.consultant_a)

        fake_img = SimpleUploadedFile("fake.png", b"This is plain text, not a PNG image!", content_type="image/png")
        res = self.client.post(
            reverse("project-concepts", kwargs={"project_id": self.project.id}),
            {"title": "Fake Concept", "description": "Corrupted image", "image": fake_img},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("image", res.data)

    def test_03_valid_pdf_deliverable_upload_succeeds(self):
        """Verify uploading a valid PDF with %PDF header succeeds."""
        self.client.force_authenticate(user=self.consultant_a)

        valid_pdf = SimpleUploadedFile("brand_guide.pdf", b"%PDF-1.5 fake valid pdf stream bytes", content_type="application/pdf")
        res = self.client.post(
            reverse("project-deliverables", kwargs={"project_id": self.project.id}),
            {"title": "Brand Guidelines v1", "description": "Final PDF", "file": valid_pdf},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        self.assertIn("id", res.data)

    def test_04_fake_pdf_deliverable_upload_rejected(self):
        """Verify uploading a non-PDF file renamed to .pdf is rejected by header magic bytes."""
        self.client.force_authenticate(user=self.consultant_a)

        fake_pdf = SimpleUploadedFile("fake.pdf", b"NOT_A_PDF_HEADER_CONTENT", content_type="application/pdf")
        res = self.client.post(
            reverse("project-deliverables", kwargs={"project_id": self.project.id}),
            {"title": "Fake PDF Deliverable", "description": "Fake", "file": fake_pdf},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("file", res.data)

    def test_05_deliverable_download_gated_behind_final_payment(self):
        """Verify client cannot download deliverable files before final payment is marked PAID."""
        self.client.force_authenticate(user=self.consultant_a)

        # Upload deliverable
        valid_pdf = SimpleUploadedFile("final_assets.pdf", b"%PDF-1.4 binary data", content_type="application/pdf")
        upload_res = self.client.post(
            reverse("project-deliverables", kwargs={"project_id": self.project.id}),
            {"title": "Final Assets", "file": valid_pdf},
            format="multipart",
        )
        self.assertEqual(upload_res.status_code, 201)
        deliv_id = upload_res.data["id"]

        # Share deliverable with client
        self.client.patch(
            reverse("project-deliverable-share", kwargs={"project_id": self.project.id, "deliverable_id": deliv_id})
        )

        # Client attempts download while final payment is READY (unpaid)
        portal_client = self.get_authenticated_client_portal()
        download_res = portal_client.get(
            reverse("client-portal-deliverable-file", kwargs={"portal_token": self.project.portal_token, "asset_id": deliv_id})
        )
        self.assertEqual(download_res.status_code, 403)
        self.assertIn("Final files will be available after the required payment is confirmed.", str(download_res.data))

        # Now mark final payment as PAID
        self.milestone_final.status = PaymentMilestone.Status.PAID
        self.milestone_final.save()

        # Client attempts download again -> Should succeed (FileResponse stream)
        auth_download_res = portal_client.get(
            reverse("client-portal-deliverable-file", kwargs={"portal_token": self.project.portal_token, "asset_id": deliv_id})
        )
        self.assertEqual(auth_download_res.status_code, 200)

    def test_06_cross_consultant_upload_isolation_returns_404(self):
        """Verify Consultant B cannot upload deliverables or concepts to Consultant A's project."""
        self.client.force_authenticate(user=self.consultant_b)

        valid_pdf = SimpleUploadedFile("hack.pdf", b"%PDF-1.4 binary", content_type="application/pdf")
        res = self.client.post(
            reverse("project-deliverables", kwargs={"project_id": self.project.id}),
            {"title": "Hacked Deliverable", "file": valid_pdf},
            format="multipart",
        )
        self.assertEqual(res.status_code, 404)
