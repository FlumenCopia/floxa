import json
import uuid
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch, MagicMock
from PIL import Image

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import (
    Client,
    Project,
    ClientProfile,
    ProjectDiscovery,
    DiscoverySliderResponse,
    DiscoveryEmotion,
    DiscoveryCompetitor,
    DiscoveryVisualStyle,
    BrandDNA,
    Moodboard,
    Concept,
    Deliverable,
    ProjectAgreement,
    ProjectAgreementAppendix,
    PaymentMilestone,
    PaymentTransaction,
    RazorpayWebhookEvent,
    ProjectActivity,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    sign_portal_access_token,
)

User = get_user_model()


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_mock_key",
    RAZORPAY_KEY_SECRET="mock_secret_key_123",
)
class FloxaEndToEndComprehensiveTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.consultant_user = User.objects.create_user(
            email="consultant@floxa.test",
            name="Alice Consultant",
            company="Floxa Studios",
            phone="+1234567890",
            password="StrongPassword123!",
        )
        self.other_consultant = User.objects.create_user(
            email="other@floxa.test",
            name="Bob Consultant",
            company="Other Agency",
            password="StrongPassword123!",
        )

    def login_consultant(self, email="consultant@floxa.test", password="StrongPassword123!"):
        response = self.client.post(
            reverse("login"),
            {"email": email, "password": password},
            format="json",
        )
        self.assertEqual(response.status_code, 200, f"Login failed: {response.data}")
        return response

    def get_authenticated_client_portal(self, portal_token):
        portal_client = APIClient()
        cookie_val = sign_portal_access_token(portal_token)
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val
        portal_client.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=str(portal_token))
        return portal_client

    def test_01_consultant_auth_flow(self):
        """Test consultant registration, login, me endpoint, and logout."""
        reg_res = self.client.post(
            reverse("register"),
            {
                "email": "newconsultant@floxa.test",
                "name": "New Consultant",
                "company": "New Brand Co",
                "phone": "+1999888777",
                "password": "Password123!@#",
            },
            format="json",
        )
        self.assertEqual(reg_res.status_code, 201)
        self.assertIn("consultant", reg_res.data)
        self.assertEqual(reg_res.data["consultant"]["email"], "newconsultant@floxa.test")

        self.login_consultant()

        me_res = self.client.get(reverse("me"))
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.data["email"], "consultant@floxa.test")
        self.assertEqual(me_res.data["name"], "Alice Consultant")

        logout_res = self.client.post(reverse("logout"))
        self.assertEqual(logout_res.status_code, 200)

    def test_02_project_creation_and_milestones_setup(self):
        """Test creating a project with milestone splits and verifying auto-generated milestone records."""
        self.login_consultant()

        payload = {
            "client": "John Client",
            "email": "john@acme.test",
            "company": "Acme Corp",
            "sector": "Fintech",
            "value": "100000.00",
            "portal_password": "PortalPassword123!",
            "advance": 50,
            "mid": 25,
            "final": 25,
            "revisions": "3 revisions",
        }

        res = self.client.post(reverse("project-list-create"), payload, format="json")
        self.assertEqual(res.status_code, 201, f"Project creation failed: {res.data}")
        project_id = res.data["project"]["id"]

        payments_res = self.client.post(
            reverse("project-payments", kwargs={"project_id": project_id})
        )
        self.assertEqual(payments_res.status_code, 200, f"Payments post failed: {payments_res.data}")

        project = Project.objects.get(id=project_id)
        self.assertEqual(project.consultant, self.consultant_user)
        self.assertEqual(project.status, Project.Status.CREATED)

        milestones = PaymentMilestone.objects.filter(project=project)
        self.assertEqual(milestones.count(), 3)
        adv = milestones.get(type=PaymentMilestone.Type.ADVANCE)
        mid = milestones.get(type=PaymentMilestone.Type.MID)
        final = milestones.get(type=PaymentMilestone.Type.FINAL)

        self.assertEqual(adv.amount, Decimal("50000.00"))
        self.assertEqual(mid.amount, Decimal("25000.00"))
        self.assertEqual(final.amount, Decimal("25000.00"))
        self.assertEqual(adv.status, PaymentMilestone.Status.READY)
        self.assertEqual(mid.status, PaymentMilestone.Status.LOCKED)
        self.assertEqual(final.status, PaymentMilestone.Status.LOCKED)

    def test_03_full_end_to_end_project_lifecycle(self):
        """Simulate the complete end-to-end workflow from project creation to final sign-off."""
        self.login_consultant()

        # Step 1: Create Project
        create_res = self.client.post(
            reverse("project-list-create"),
            {
                "client": "TechVentures",
                "email": "founder@techventures.test",
                "company": "TechVentures Inc",
                "sector": "AI & Robotics",
                "value": "80000.00",
                "portal_password": "ClientPortalPass123!",
                "advance": 50,
                "mid": 25,
                "final": 25,
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        project_id = create_res.data["project"]["id"]
        portal_token = create_res.data["project"]["portal_token"]

        # Initialize payment milestones
        self.client.post(reverse("project-payments", kwargs={"project_id": project_id}))

        # Step 2a: Client Verifies Password
        unauth_portal = APIClient()
        pw_verify_res = unauth_portal.post(
            reverse("client-portal-verify-password", kwargs={"portal_token": portal_token}),
            {"password": "ClientPortalPass123!"},
            format="json",
        )
        self.assertEqual(pw_verify_res.status_code, 200, f"Password verify failed: {pw_verify_res.data}")

        client_portal = self.get_authenticated_client_portal(portal_token)

        # Step 2b: Client accesses Client Portal Project Details
        portal_res = client_portal.get(reverse("client-portal-project", kwargs={"portal_token": portal_token}))
        self.assertEqual(portal_res.status_code, 200)
        self.assertEqual(portal_res.data["company_name"], "TechVentures Inc")

        # Step 2c: Client Submits Complete Client Profile
        profile_payload = {
            "client_name": "Jane TechFounder",
            "company_name": "TechVentures Inc",
            "industry": "AI & Robotics",
            "year_started": 2024,
            "location": "San Francisco, CA",
            "phone": "9876543210",
            "email": "founder@techventures.test",
            "website": "https://techventures.test",
        }
        profile_res = client_portal.post(
            reverse("project-client-profile", kwargs={"project_id": project_id}),
            profile_payload,
            format="json",
        )
        self.assertEqual(profile_res.status_code, 200, f"Profile submit failed: {profile_res.data}")

        # Step 3: Client Submits Discovery Questionnaire
        discovery_payload = {
            "what_business_does": "Building next-gen AI robotic operating systems.",
            "target_customer": "Enterprise logistics leaders and automation architects.",
            "why_choose_us": "Zero-latency real-time spatial intelligence.",
            "brand_feeling": "High precision, authoritative yet visionary.",
            "audience_archetype": "The Creator / The Visionary",
            "sliders": [
                {"slider_key": "modern_classic", "left_label": "Classic", "right_label": "Modern", "value": 90},
                {"slider_key": "playful_serious", "left_label": "Playful", "right_label": "Serious", "value": 75},
            ],
            "emotions": [{"emotion": "Innovative"}, {"emotion": "Trusted"}, {"emotion": "Sophisticated"}],
            "competitors": [
                {"name": "Boston Dynamics", "rating": "like", "reason": "Engineering excellence"},
                {"name": "Legacy Tech", "rating": "dislike", "reason": "Outdated aesthetic"},
            ],
            "visual_styles": [{"style": "Cyber Minimal"}, {"style": "Dark Mode Glass"}],
        }
        disc_res = client_portal.post(
            reverse("project-discovery-submit", kwargs={"project_id": project_id}),
            discovery_payload,
            format="json",
        )
        self.assertEqual(disc_res.status_code, 200, f"Discovery submit failed: {disc_res.data}")

        # Step 4: Consultant Reviews Discovery Summary and Generates Brand DNA
        self.login_consultant()
        summary_res = self.client.get(
            reverse("project-discovery-summary", kwargs={"project_id": project_id})
        )
        self.assertEqual(summary_res.status_code, 200)

        with patch("ai_assistant.services.generate_response") as mock_ai:
            mock_ai.return_value = json.dumps({
                "brand_personality_cluster": "Visionary Innovator",
                "business_summary": "Pioneering robotic OS.",
                "target_audience_summary": "Enterprise tech executives.",
                "positioning_summary": "Top-tier AI robotics brand.",
                "brand_feeling_summary": "Futuristic and reliable.",
                "visual_direction_summary": "Cyber-minimal dark aesthetic.",
                "competitor_summary": "Differentiates on software intelligence.",
            })
            dna_gen_res = self.client.post(
                reverse("project-brand-dna-generate", kwargs={"project_id": project_id})
            )
            self.assertEqual(dna_gen_res.status_code, 200)

        # Step 5: Consultant Generates Project Agreement, Shares, and Requests Signature
        gen_agree_res = self.client.post(
            reverse("project-agreement-generate", kwargs={"project_id": project_id})
        )
        self.assertEqual(gen_agree_res.status_code, 200, f"Agreement generate failed: {gen_agree_res.data}")

        share_agree_res = self.client.post(
            reverse("project-agreement-share", kwargs={"project_id": project_id})
        )
        self.assertEqual(share_agree_res.status_code, 200)

        req_sig_res = self.client.post(
            reverse("project-agreement-request-signature", kwargs={"project_id": project_id})
        )
        self.assertEqual(req_sig_res.status_code, 200, f"Request signature failed: {req_sig_res.data}")

        # Step 6: Client Signs the Agreement via Client Portal
        sign_payload = {
            "signer_name": "Jane TechFounder",
            "signature_method": "typed",
            "has_read_agreement": True,
        }
        sign_res = client_portal.post(
            reverse("client-portal-project-agreement-sign", kwargs={"portal_token": portal_token}),
            sign_payload,
            format="json",
        )
        self.assertEqual(sign_res.status_code, 200, f"Sign failed: {sign_res.data}")

        # Step 7: Advance Payment Flow (Consultant requests advance payment first)
        adv_milestone = PaymentMilestone.objects.get(
            project_id=project_id, type=PaymentMilestone.Type.ADVANCE
        )
        req_pay_res = self.client.post(
            reverse("project-payment-request", kwargs={"project_id": project_id, "milestone_id": adv_milestone.id})
        )
        self.assertEqual(req_pay_res.status_code, 200)
        adv_milestone.refresh_from_db()
        self.assertEqual(adv_milestone.status, PaymentMilestone.Status.REQUESTED)

        # Client creates Razorpay Order
        with patch("projects.views.create_razorpay_order") as mock_create_order:
            mock_create_order.return_value = {
                "id": "order_test_advance_123",
                "amount": 4000000,
                "currency": "INR",
                "receipt": f"floxa-{adv_milestone.id}-mock",
                "status": "created",
            }
            order_res = client_portal.post(
                reverse(
                    "client-portal-payment-create-order",
                    kwargs={"portal_token": portal_token, "milestone_id": adv_milestone.id},
                ),
            )
            self.assertEqual(order_res.status_code, 201, f"Order create failed: {order_res.data}")
            self.assertEqual(order_res.data["razorpay_order_id"], "order_test_advance_123")

        # Client verifies payment
        with patch("projects.views.verify_razorpay_payment_signature") as mock_verify_sig, \
             patch("projects.views.fetch_razorpay_payment") as mock_fetch_pay:
            mock_verify_sig.return_value = True
            mock_fetch_pay.return_value = {
                "id": "pay_test_adv_999",
                "status": "captured",
                "order_id": "order_test_advance_123",
                "amount": 4000000,
                "currency": "INR",
            }

            verify_res = client_portal.post(
                reverse("client-portal-payment-verify", kwargs={"portal_token": portal_token}),
                {
                    "milestone_id": adv_milestone.id,
                    "razorpay_order_id": "order_test_advance_123",
                    "razorpay_payment_id": "pay_test_adv_999",
                    "razorpay_signature": "mock_signature_valid",
                },
                format="json",
            )
            self.assertEqual(verify_res.status_code, 200, f"Payment verify failed: {verify_res.data}")

        # Verify milestone is PAID
        adv_milestone.refresh_from_db()
        self.assertEqual(adv_milestone.status, PaymentMilestone.Status.PAID)

        # Step 7b: Consultant Uploads Moodboard and Client Selects it
        mb_io = BytesIO()
        mb_img = Image.new("RGB", (100, 100), color="green")
        mb_img.save(mb_io, format="PNG")
        mb_file = SimpleUploadedFile("moodboard1.png", mb_io.getvalue(), content_type="image/png")

        mb_res = self.client.post(
            reverse("project-moodboards", kwargs={"project_id": project_id}),
            {"title": "Cyber Aesthetics Moodboard", "description": "Visual direction", "image": mb_file},
            format="multipart",
        )
        self.assertEqual(mb_res.status_code, 201)
        mb_id = mb_res.data["id"]

        # Client selects moodboard
        select_mb_res = client_portal.post(
            reverse(
                "client-portal-moodboard-select",
                kwargs={"portal_token": portal_token, "moodboard_id": mb_id},
            ),
        )
        self.assertEqual(select_mb_res.status_code, 200)

        # Step 8: Consultant Uploads Concepts & Shares with Client
        img_io = BytesIO()
        img = Image.new("RGB", (100, 100), color="blue")
        img.save(img_io, format="PNG")
        img_file = SimpleUploadedFile("concept1.png", img_io.getvalue(), content_type="image/png")

        concept_res = self.client.post(
            reverse("project-concepts", kwargs={"project_id": project_id}),
            {"title": "Concept Alpha - Minimal Dark", "description": "Primary brand identity", "image": img_file},
            format="multipart",
        )
        self.assertEqual(concept_res.status_code, 201)
        concept_id = concept_res.data["id"]

        share_c_res = self.client.patch(
            reverse("project-concept-share", kwargs={"project_id": project_id, "concept_id": concept_id})
        )
        self.assertEqual(share_c_res.status_code, 200)

        # Step 9: Client Approves Concept
        feedback_res = client_portal.post(
            reverse(
                "client-portal-concept-feedback",
                kwargs={"portal_token": portal_token, "concept_id": concept_id},
            ),
            {"action": "approved"},
            format="json",
        )
        self.assertEqual(feedback_res.status_code, 200)

        # Step 10: Consultant Uploads Final Deliverables & Shares
        dummy_pdf = SimpleUploadedFile("brand_guide.pdf", b"%PDF-1.4 fake pdf binary content", content_type="application/pdf")
        deliv_res = self.client.post(
            reverse("project-deliverables", kwargs={"project_id": project_id}),
            {"title": "Complete Brand Asset Pack v1.0", "description": "SVG/PNG assets", "file": dummy_pdf},
            format="multipart",
        )
        self.assertEqual(deliv_res.status_code, 201)
        deliv_id = deliv_res.data["id"]

        deliv_share_res = self.client.patch(
            reverse("project-deliverable-share", kwargs={"project_id": project_id, "deliverable_id": deliv_id})
        )
        self.assertEqual(deliv_share_res.status_code, 200)

        # Step 11: Mark remaining milestones paid and do final sign-off
        mid_milestone = PaymentMilestone.objects.get(project_id=project_id, type=PaymentMilestone.Type.MID)
        final_milestone = PaymentMilestone.objects.get(project_id=project_id, type=PaymentMilestone.Type.FINAL)
        mid_milestone.status = PaymentMilestone.Status.PAID
        mid_milestone.save()
        final_milestone.status = PaymentMilestone.Status.PAID
        final_milestone.save()

        signoff_res = client_portal.post(
            reverse("client-portal-sign-off", kwargs={"portal_token": portal_token}),
        )
        self.assertEqual(signoff_res.status_code, 200)

        from projects.progress import calculate_project_progress

        proj = Project.objects.get(id=project_id)
        self.assertTrue(proj.client_signed_off)
        self.assertEqual(calculate_project_progress(proj), 100)

    def test_04_cross_consultant_authorization_security(self):
        """Verify that Consultant A cannot view, modify, or delete Consultant B's projects or assets."""
        self.login_consultant(email="consultant@floxa.test")
        p_res = self.client.post(
            reverse("project-list-create"),
            {
                "client": "Private Client",
                "email": "private@client.test",
                "company": "Secret Corp",
                "sector": "Defense",
                "value": "50000.00",
                "portal_password": "PrivatePassword123!",
            },
            format="json",
        )
        self.assertEqual(p_res.status_code, 201)
        p_id = p_res.data["project"]["id"]

        self.login_consultant(email="other@floxa.test")

        detail_res = self.client.get(reverse("project-detail", kwargs={"pk": p_id}))
        self.assertEqual(detail_res.status_code, 404)

        dna_res = self.client.get(reverse("project-brand-dna", kwargs={"project_id": p_id}))
        self.assertEqual(dna_res.status_code, 404)

        concept_res = self.client.post(
            reverse("project-concepts", kwargs={"project_id": p_id}),
            {"title": "Hacked Concept", "description": "Unauthorized"},
            format="json",
        )
        self.assertEqual(concept_res.status_code, 404)

    def test_05_invalid_input_and_edge_case_validation(self):
        """Test boundary conditions and error handling across endpoints."""
        self.login_consultant()

        invalid_p = self.client.post(
            reverse("project-list-create"),
            {
                "client": "Bad Splits",
                "email": "bad@split.test",
                "company": "Bad Corp",
                "sector": "Retail",
                "value": "10000.00",
                "portal_password": "Password123!",
                "advance": 60,
                "mid": 30,
                "final": 20,
            },
            format="json",
        )
        self.assertEqual(invalid_p.status_code, 400)
        self.assertIn("payment_split", invalid_p.data)

        fake_token = uuid.uuid4()
        portal_client = APIClient()
        fake_res = portal_client.post(
            reverse("client-portal-verify-password", kwargs={"portal_token": fake_token}),
            {"password": "WrongPassword123!"},
            format="json",
        )
        self.assertEqual(fake_res.status_code, 404)
