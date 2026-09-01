import base64
import json
import uuid
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from PIL import Image

from projects.models import (
    Client,
    Project,
    ClientProfile,
    ProjectDiscovery,
    DiscoverySliderResponse,
    DiscoveryEmotion,
    DiscoveryCompetitor,
    DiscoveryVisualStyle,
    ProjectAgreement,
    ProjectAgreementAppendix,
    GeneratedAgreementSnapshot,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    sign_portal_access_token,
    save_agreement_snapshot_pdf,
    append_project_agreement_evidence,
)

User = get_user_model()


class Phase1AgreementTests(TestCase):
    """
    Dedicated test suite for Phase 1:
    Verifies agreement generation, PDF retrieval, all 3 signature methods (typed, drawn, uploaded),
    snapshot generation/saving, evidence appending, and permission boundaries.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant = User.objects.create_user(
            email="consultant_phase1@floxa.test",
            name="Alice Phase1",
            password="StrongPassword123!",
        )
        self.other_consultant = User.objects.create_user(
            email="other_phase1@floxa.test",
            name="Bob Phase1",
            password="StrongPassword123!",
        )

        # Create Client and Project
        self.client_record = Client.objects.create(
            name="Phase1 Client",
            email="client@phase1.test",
            company_name="Phase1 Corp",
            sector="Design & AI",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Phase1 Project",
            company_name="Phase1 Corp",
            sector="Design & AI",
            project_value=150000.00,
            advance_percentage=50,
            mid_percentage=25,
            final_percentage=25,
            portal_token=uuid.uuid4(),
        )

        # Complete Client Profile (Prerequisite)
        self.profile = ClientProfile.objects.create(
            project=self.project,
            client_name="Phase1 Client",
            company_name="Phase1 Corp",
            industry="Design & AI",
            year_started=2023,
            location="New York, NY",
            phone="1234567890",
            email="client@phase1.test",
        )

        # Complete Discovery (Prerequisite)
        self.discovery = ProjectDiscovery.objects.create(
            project=self.project,
            what_business_does="Next-gen AI visual automation.",
            target_customer="Creative agencies and design studios.",
            why_choose_us="Real-time generative pipelines.",
            brand_feeling="Minimal, precise, and authoritative.",
            audience_archetype="The Creator",
        )
        DiscoverySliderResponse.objects.create(
            discovery=self.discovery, slider_key="modern_classic", value=85
        )
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Innovative")
        DiscoveryCompetitor.objects.create(
            discovery=self.discovery, name="Comp A", rating="like", reason="Fast rendering"
        )
        DiscoveryVisualStyle.objects.create(discovery=self.discovery, style="Minimal High-Contrast")

    def login_consultant(self, user=None):
        target = user or self.consultant
        self.client.force_authenticate(user=target)

    def get_authenticated_client_portal(self, project=None):
        proj = project or self.project
        portal_client = APIClient()
        cookie_val = sign_portal_access_token(proj.portal_token)
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val
        portal_client.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=str(proj.portal_token))
        return portal_client

    def generate_base64_png(self):
        img_io = BytesIO()
        img = Image.new("RGBA", (150, 60), color=(0, 0, 0, 0))
        img.save(img_io, format="PNG")
        raw_bytes = img_io.getvalue()
        b64_str = base64.b64encode(raw_bytes).decode("ascii")
        return f"data:image/png;base64,{b64_str}"

    def test_01_agreement_generation_and_pdf_retrieval(self):
        """Verify consultant can generate the agreement and fetch the PDF without ContentFile errors."""
        self.login_consultant()

        gen_res = self.client.post(
            reverse("project-agreement-generate", kwargs={"project_id": self.project.id})
        )
        self.assertEqual(gen_res.status_code, 200, f"Agreement generation failed: {gen_res.data}")
        self.assertIn("basic_pdf_url", gen_res.data)

        # Verify agreement record was created in database
        agreement = ProjectAgreement.objects.get(project=self.project)
        self.assertEqual(agreement.status, ProjectAgreement.Status.DRAFT)
        self.assertTrue(bool(agreement.basic_pdf_file))

        # Share agreement
        share_res = self.client.post(
            reverse("project-agreement-share", kwargs={"project_id": self.project.id})
        )
        self.assertEqual(share_res.status_code, 200)

        # Request signature
        req_res = self.client.post(
            reverse("project-agreement-request-signature", kwargs={"project_id": self.project.id})
        )
        self.assertEqual(req_res.status_code, 200)
        agreement.refresh_from_db()
        self.assertIsNotNone(agreement.signature_requested_at)

        # Verify Client Portal can retrieve PDF
        client_portal = self.get_authenticated_client_portal()
        pdf_res = client_portal.get(
            reverse("client-portal-project-agreement-pdf", kwargs={"portal_token": self.project.portal_token})
        )
        self.assertEqual(pdf_res.status_code, 200)
        self.assertEqual(pdf_res["content-type"], "application/pdf")

    def test_02_typed_signature_signing_and_appendix_creation(self):
        """Verify client can sign agreement using typed legal name signature."""
        self.login_consultant()
        self.client.post(reverse("project-agreement-generate", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-share", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-request-signature", kwargs={"project_id": self.project.id}))

        client_portal = self.get_authenticated_client_portal()
        sign_payload = {
            "signer_name": "Jane Client",
            "signature_method": "typed",
            "has_read_agreement": True,
        }
        sign_res = client_portal.post(
            reverse("client-portal-project-agreement-sign", kwargs={"portal_token": self.project.portal_token}),
            sign_payload,
            format="json",
        )
        self.assertEqual(sign_res.status_code, 200, f"Typed signature signing failed: {sign_res.data}")

        agreement = ProjectAgreement.objects.get(project=self.project)
        self.assertEqual(agreement.status, ProjectAgreement.Status.SIGNED)
        self.assertEqual(agreement.signer_name, "Jane Client")
        self.assertEqual(agreement.signature_method, "typed")
        self.assertTrue(bool(agreement.signed_pdf_file))
        self.assertTrue(bool(agreement.original_signed_pdf_file))

        # Test subsequent milestone evidence append to agreement
        appendix = append_project_agreement_evidence(
            self.project,
            event_type="advance_payment_verified",
            title="Advance Payment Verified (₹75,000.00)",
            metadata={"amount": 75000.00},
        )
        self.assertIsNotNone(appendix)
        self.assertEqual(ProjectAgreementAppendix.objects.filter(agreement=agreement).count(), 1)

    def test_03_drawn_canvas_signature_and_image_decode(self):
        """Verify client can sign using drawn canvas signature encoded as base64 PNG."""
        self.login_consultant()
        self.client.post(reverse("project-agreement-generate", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-share", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-request-signature", kwargs={"project_id": self.project.id}))

        canvas_png = self.generate_base64_png()
        client_portal = self.get_authenticated_client_portal()
        sign_payload = {
            "signer_name": "John DrawnSigner",
            "signature_method": "drawn",
            "signature_image": canvas_png,
            "has_read_agreement": True,
        }
        sign_res = client_portal.post(
            reverse("client-portal-project-agreement-sign", kwargs={"portal_token": self.project.portal_token}),
            sign_payload,
            format="json",
        )
        self.assertEqual(sign_res.status_code, 200, f"Drawn signature signing failed: {sign_res.data}")

        agreement = ProjectAgreement.objects.get(project=self.project)
        self.assertEqual(agreement.status, ProjectAgreement.Status.SIGNED)
        self.assertEqual(agreement.signature_method, "drawn")
        self.assertTrue(bool(agreement.signature_image))
        self.assertTrue(bool(agreement.signed_pdf_file))

    def test_04_uploaded_signature_image(self):
        """Verify client can sign using uploaded signature image."""
        self.login_consultant()
        self.client.post(reverse("project-agreement-generate", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-share", kwargs={"project_id": self.project.id}))
        self.client.post(reverse("project-agreement-request-signature", kwargs={"project_id": self.project.id}))

        upload_png = self.generate_base64_png()
        client_portal = self.get_authenticated_client_portal()
        sign_payload = {
            "signer_name": "Sarah UploadSigner",
            "signature_method": "uploaded",
            "signature_image": upload_png,
            "has_read_agreement": True,
        }
        sign_res = client_portal.post(
            reverse("client-portal-project-agreement-sign", kwargs={"portal_token": self.project.portal_token}),
            sign_payload,
            format="json",
        )
        self.assertEqual(sign_res.status_code, 200, f"Uploaded signature signing failed: {sign_res.data}")

        agreement = ProjectAgreement.objects.get(project=self.project)
        self.assertEqual(agreement.status, ProjectAgreement.Status.SIGNED)
        self.assertEqual(agreement.signature_method, "uploaded")
        self.assertTrue(bool(agreement.signature_image))

    def test_05_generated_agreement_snapshot_save(self):
        """Verify GeneratedAgreementSnapshot PDF saving works cleanly with ContentFile."""
        snapshot = GeneratedAgreementSnapshot.objects.create(
            project=self.project,
            version=1,
            status=GeneratedAgreementSnapshot.Status.DRAFT,
            snapshot={
                "project_title": "Phase1 Project",
                "client_name": "Phase1 Client",
                "company_name": "Phase1 Corp",
                "scope_items": ["Brand Strategy", "Visual Identity"],
                "deliverables": ["Logo Assets", "Brand Guidelines"],
                "total_price": "150000.00",
                "milestones": [
                    {"name": "Advance", "percentage": 50, "amount": "75000.00"},
                    {"name": "Mid", "percentage": 25, "amount": "37500.00"},
                    {"name": "Final", "percentage": 25, "amount": "37500.00"},
                ],
            },
            generated_at=self.project.created_at,
        )

        updated_snapshot = save_agreement_snapshot_pdf(snapshot)
        self.assertTrue(bool(updated_snapshot.pdf_file))
        self.assertIsNotNone(updated_snapshot.pdf_generated_at)

    def test_06_permission_and_isolation_checks(self):
        """Verify unauthorized consultants and clients cannot access or sign agreements."""
        # Consultant B cannot generate or access Consultant A's agreement
        self.login_consultant(user=self.other_consultant)
        unauth_gen = self.client.post(
            reverse("project-agreement-generate", kwargs={"project_id": self.project.id})
        )
        self.assertEqual(unauth_gen.status_code, 404)

        # Signing without signature request must return 404
        unrequested_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Unrequested Project",
            company_name="Unrequested Corp",
            sector="Tech",
            portal_token=uuid.uuid4(),
        )
        client_portal = self.get_authenticated_client_portal(project=unrequested_project)
        sign_attempt = client_portal.post(
            reverse("client-portal-project-agreement-sign", kwargs={"portal_token": unrequested_project.portal_token}),
            {"signer_name": "Test", "signature_method": "typed", "has_read_agreement": True},
            format="json",
        )
        self.assertEqual(sign_attempt.status_code, 404)
