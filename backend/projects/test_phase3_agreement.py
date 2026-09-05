from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from projects.models import (
    Agreement,
    Client,
    ClientProfile,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoveryVisualStyle,
    Project,
    ProjectAgreement,
    ProjectDiscovery,
)
from projects.views import PORTAL_ACCESS_COOKIE_NAME, sign_portal_access_token

User = get_user_model()


@override_settings(DEBUG=True)
class Phase3AgreementWorkflowTests(TestCase):
    def setUp(self):
        self.consultant = User.objects.create_user(
            email="consultant_phase3@example.com",
            password="password123",
            name="Consultant Phase3",
        )
        self.other_consultant = User.objects.create_user(
            email="other_phase3@example.com",
            password="password123",
            name="Other Consultant",
        )
        self.client_user = Client.objects.create(
            name="Acme Corp Client",
            email="acme_phase3@example.com",
            company_name="Acme Corp",
            sector="Technology",
        )
        self.project = Project.objects.create(
            title="Phase3 Test Project",
            consultant=self.consultant,
            client=self.client_user,
            company_name="Acme Corp",
            sector="Technology",
        )
        ClientProfile.objects.create(
            project=self.project,
            client_name="Acme Corp Client",
            company_name="Acme Corp",
            email="acme_phase3@example.com",
            phone="+1234567890",
            industry="Technology",
            location="New York",
            website="https://acme.example.com",
        )
        self.discovery = ProjectDiscovery.objects.create(
            project=self.project,
            what_business_does="Enterprise software development",
            target_customer="B2B companies",
            why_choose_us="High reliability",
            brand_feeling="Professional and sleek",
            audience_archetype="The Innovator",
        )
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Innovative")
        DiscoveryCompetitor.objects.create(discovery=self.discovery, name="Competitor X")
        DiscoveryVisualStyle.objects.create(discovery=self.discovery, style="Minimalist")

        self.client_jwt = APIClient()
        self.client_jwt.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.consultant).access_token}"
        )

        self.other_jwt = APIClient()
        self.other_jwt.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.other_consultant).access_token}"
        )

        self.anon_client = APIClient()
        self.anon_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.project.portal_token)

    def test_manual_only_upload_and_immediate_get_agreement(self):
        """FLOW-001: When only manual Agreement exists, POST upload followed by GET returns 200 with uploaded agreement data."""
        pdf_content = b"%PDF-1.4 simulated agreement PDF content"
        pdf_file = SimpleUploadedFile("master_agreement.pdf", pdf_content, content_type="application/pdf")

        # 1. Upload manual agreement
        post_response = self.client_jwt.post(
            f"/api/projects/{self.project.id}/agreement/",
            {"title": "Master Services Agreement", "file": pdf_file},
            format="multipart",
        )
        self.assertEqual(post_response.status_code, 201)
        self.assertEqual(post_response.data["title"], "Master Services Agreement")
        self.assertTrue(post_response.data["file_name"].startswith("master_agreement"))
        self.assertIn("file_url", post_response.data)

        # 2. Immediately GET agreement
        get_response = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["id"], post_response.data["id"])
        self.assertEqual(get_response.data["title"], "Master Services Agreement")
        self.assertEqual(get_response.data["file_name"], post_response.data["file_name"])
        self.assertIn(f"/api/projects/{self.project.id}/agreement/{post_response.data['id']}/file/", get_response.data["file_url"])

    def test_generated_only_get_agreement(self):
        """When only ProjectAgreement exists, GET returns the structured ProjectAgreement payload."""
        generate_response = self.client_jwt.post(f"/api/projects/{self.project.id}/agreement/generate/")
        self.assertEqual(generate_response.status_code, 200)
        self.assertEqual(generate_response.data["status"], "draft")
        self.assertIn("basic_pdf_url", generate_response.data)

        get_response = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data["status"], "draft")
        self.assertEqual(get_response.data["current_version"], 1)
        self.assertIn("basic_pdf_url", get_response.data)

    def test_both_models_present_preserves_project_agreement(self):
        """When both ProjectAgreement and Agreement exist, GET preserves the ProjectAgreement response."""
        project_agreement = ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.DRAFT,
            basic_pdf_file=SimpleUploadedFile("basic.pdf", b"%PDF-1.4 basic", content_type="application/pdf"),
        )
        manual_agreement = Agreement.objects.create(
            project=self.project,
            title="Manual Uploaded Agreement",
            file=SimpleUploadedFile("manual.pdf", b"%PDF-1.4 manual", content_type="application/pdf"),
        )

        response = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(response.status_code, 200)
        # Must return project_agreement payload, preserving existing structured workflow
        self.assertEqual(response.data["id"], project_agreement.id)
        self.assertEqual(response.data["status"], "draft")
        self.assertIn("basic_pdf_url", response.data)

        # But the manual agreement file remains accessible via its dedicated file endpoint
        manual_file_res = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/{manual_agreement.id}/file/")
        self.assertEqual(manual_file_res.status_code, 200)

    def test_neither_present_returns_404(self):
        """When neither manual nor generated agreement exists, GET returns 404 'Agreement not found.'."""
        response = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Agreement not found.")

    def test_timestamp_changes_do_not_switch_selected_document(self):
        """Modifying timestamps on manual or generated agreement does not alter deterministic selection."""
        project_agreement = ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.DRAFT,
            basic_pdf_file=SimpleUploadedFile("basic.pdf", b"%PDF-1.4 basic", content_type="application/pdf"),
        )
        manual_agreement = Agreement.objects.create(
            project=self.project,
            title="Manual Agreement",
            file=SimpleUploadedFile("manual.pdf", b"%PDF-1.4 manual", content_type="application/pdf"),
        )

        # Artificially modify timestamps to make manual agreement much newer
        ProjectAgreement.objects.filter(id=project_agreement.id).update(updated_at=timezone.now() - timezone.timedelta(days=10))
        Agreement.objects.filter(id=manual_agreement.id).update(updated_at=timezone.now())

        response = self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], project_agreement.id)
        self.assertIn("basic_pdf_url", response.data)

    def test_get_request_does_not_mutate_records(self):
        """GET request does not mutate database counts or timestamps."""
        Agreement.objects.create(
            project=self.project,
            title="Static Agreement",
            file=SimpleUploadedFile("static.pdf", b"%PDF-1.4 static", content_type="application/pdf"),
        )
        agreement_count_before = Agreement.objects.count()
        pa_count_before = ProjectAgreement.objects.count()

        self.client_jwt.get(f"/api/projects/{self.project.id}/agreement/")

        self.assertEqual(Agreement.objects.count(), agreement_count_before)
        self.assertEqual(ProjectAgreement.objects.count(), pa_count_before)

    def test_client_portal_visibility_and_signing_restrictions(self):
        """Client portal enforces pre-existing signature_requested_at visibility policy."""
        # 1. No agreement -> 404
        res1 = self.anon_client.get(f"/api/client-portal/{self.project.portal_token}/agreement/")
        self.assertEqual(res1.status_code, 404)

        # 2. Only manual agreement -> 404 (does not leak unshared manual agreement through portal agreement endpoint)
        Agreement.objects.create(
            project=self.project,
            title="Manual Doc",
            file=SimpleUploadedFile("manual.pdf", b"%PDF-1.4 manual", content_type="application/pdf"),
        )
        res2 = self.anon_client.get(f"/api/client-portal/{self.project.portal_token}/agreement/")
        self.assertEqual(res2.status_code, 404)

        # 3. ProjectAgreement exists but signature_requested_at is None -> 404
        pa = ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.DRAFT,
            basic_pdf_file=SimpleUploadedFile("basic.pdf", b"%PDF-1.4 basic", content_type="application/pdf"),
        )
        res3 = self.anon_client.get(f"/api/client-portal/{self.project.portal_token}/agreement/")
        self.assertEqual(res3.status_code, 404)
        self.assertEqual(res3.data["detail"], "Agreement signature has not been requested yet.")

        # 4. Signature requested -> 200 with ProjectAgreement payload
        pa.signature_requested_at = timezone.now()
        pa.status = ProjectAgreement.Status.SIGNATURE_REQUESTED
        pa.save(update_fields=["signature_requested_at", "status"])

        res4 = self.anon_client.get(f"/api/client-portal/{self.project.portal_token}/agreement/")
        self.assertEqual(res4.status_code, 200)
        self.assertEqual(res4.data["id"], pa.id)
        self.assertIn("basic_pdf_url", res4.data)

        # 5. Client signs the ProjectAgreement
        sign_res = self.anon_client.post(
            f"/api/client-portal/{self.project.portal_token}/agreement/sign/",
            {
                "signer_name": "Acme Authorized Signer",
                "signature_method": "typed",
                "has_read_agreement": True,
            },
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.project.portal_token),
            format="json",
        )
        self.assertEqual(sign_res.status_code, 200)
        pa.refresh_from_db()
        self.assertEqual(pa.status, ProjectAgreement.Status.SIGNED)
        self.assertEqual(pa.signer_name, "Acme Authorized Signer")

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated GET /api/projects/<id>/agreement/ returns 401."""
        anon = APIClient()
        response = anon.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(response.status_code, 401)

    def test_unauthorized_consultant_rejected(self):
        """Consultant who does not own the project cannot retrieve the agreement."""
        Agreement.objects.create(
            project=self.project,
            title="Secret Agreement",
            file=SimpleUploadedFile("secret.pdf", b"%PDF-1.4 secret", content_type="application/pdf"),
        )
        response = self.other_jwt.get(f"/api/projects/{self.project.id}/agreement/")
        self.assertEqual(response.status_code, 404)

    def test_duplicate_manual_upload_rejected(self):
        """Uploading an agreement when one already exists returns 400 Bad Request."""
        Agreement.objects.create(
            project=self.project,
            title="Existing Agreement",
            file=SimpleUploadedFile("existing.pdf", b"%PDF-1.4 existing", content_type="application/pdf"),
        )
        response = self.client_jwt.post(
            f"/api/projects/{self.project.id}/agreement/",
            {"title": "Duplicate", "file": SimpleUploadedFile("dup.pdf", b"%PDF-1.4 dup", content_type="application/pdf")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Agreement already exists.")
