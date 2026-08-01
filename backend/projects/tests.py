import hashlib
import hmac
import json
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from ai_assistant.services import GeminiProviderError, GeminiRateLimitError
from accounts.models import Consultant

from .models import Client, Concept, Deliverable, PaymentMilestone, PaymentTransaction, Project, ProjectAgreement, RazorpayWebhookEvent, Moodboard, Agreement
from .progress import calculate_project_progress
from .views import (
    PORTAL_ACCESS_COOKIE_NAME,
    PaymentCompletionError,
    PROJECT_ASSISTANT_PROMPT_MAX_LENGTH,
    _build_project_assistant_prompt,
    _get_project_assistant_prompt_max_length,
    complete_payment_milestone,
    sign_portal_access_token,
)


class ProjectProgressCalculationTests(TestCase):
    def setUp(self):
        self.consultant = Consultant.objects.create_user(
            email="progress@example.com",
            name="Progress",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Client",
            email="client-progress@example.com",
            company_name="Client Co",
            sector="Branding",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Progress Project",
            company_name="Progress Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
        )
        Concept.objects.create(
            project=self.project,
            title="Approved Concept",
            status=Concept.Status.APPROVED,
        )

    def test_unsigned_project_agreement_does_not_award_agreement_progress(self):
        ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.DRAFT,
        )

        self.assertEqual(calculate_project_progress(self.project), 15)

    def test_signature_requested_project_agreement_does_not_award_agreement_progress(self):
        ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.SIGNATURE_REQUESTED,
        )

        self.assertEqual(calculate_project_progress(self.project), 15)

    def test_signed_project_agreement_awards_agreement_progress(self):
        ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.SIGNED,
            signed_at=timezone.now(),
        )

        self.assertEqual(calculate_project_progress(self.project), 25)

    def test_blank_project_returns_zero_progress(self):
        blank_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Blank Project",
            company_name="Blank Co",
            sector="Design",
            project_value=Decimal("500.00"),
        )

        self.assertEqual(calculate_project_progress(blank_project), 0)

    def test_early_signed_agreement_does_not_jump_to_82(self):
        blank_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Early Agreement Project",
            company_name="Early Co",
            sector="Design",
            project_value=Decimal("500.00"),
        )
        ProjectAgreement.objects.create(
            project=blank_project,
            status=ProjectAgreement.Status.SIGNED,
            signed_at=timezone.now(),
        )

        self.assertEqual(calculate_project_progress(blank_project), 10)

    def test_each_milestone_adds_only_its_assigned_weight(self):
        proj = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Step Project",
            company_name="Step Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
        )
        self.assertEqual(calculate_project_progress(proj), 0)

        # 1. Profile +5
        from .models import ClientProfile, ProjectDiscovery, DiscoveryEmotion, DiscoveryCompetitor, DiscoveryVisualStyle, BrandDNA
        ClientProfile.objects.create(
            project=proj,
            client_name="Test Client",
            company_name="Step Co",
            industry="Retail",
        )
        self.assertEqual(calculate_project_progress(proj), 5)

        # 2. Complete Discovery +10
        discovery = ProjectDiscovery.objects.create(
            project=proj,
            what_business_does="Retail sales",
            target_customer="Consumers",
            why_choose_us="Quality",
            brand_feeling="Warm",
            audience_archetype="Shoppers",
            submitted_at=timezone.now(),
        )
        DiscoveryEmotion.objects.create(discovery=discovery, emotion="Joy")
        DiscoveryCompetitor.objects.create(discovery=discovery, name="Comp", rating=4)
        DiscoveryVisualStyle.objects.create(discovery=discovery, style="Minimal")
        self.assertEqual(calculate_project_progress(proj), 15)

        # 3. Complete Brand DNA +10
        BrandDNA.objects.create(
            project=proj,
            brand_personality_cluster="Premium",
            business_summary="Quality retail focus.",
        )
        self.assertEqual(calculate_project_progress(proj), 25)

        # 4. Advance payment PAID +10
        PaymentMilestone.objects.create(
            project=proj,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=30,
            amount=Decimal("300.00"),
            status=PaymentMilestone.Status.PAID,
            paid_at=timezone.now(),
        )
        self.assertEqual(calculate_project_progress(proj), 35)

        # 5. Moodboard created +5
        mb = Moodboard.objects.create(
            project=proj,
            title="Moodboard 1",
            is_selected=False,
        )
        self.assertEqual(calculate_project_progress(proj), 40)

        # 6. Moodboard selected +5
        mb.is_selected = True
        mb.save()
        self.assertEqual(calculate_project_progress(proj), 45)

        # 7. Concept SHARED +5
        concept = Concept.objects.create(
            project=proj,
            title="Concept 1",
            status=Concept.Status.SHARED,
        )
        self.assertEqual(calculate_project_progress(proj), 50)

        # 8. Concept APPROVED +10 additional (total 15 for concepts)
        concept.status = Concept.Status.APPROVED
        concept.save()
        self.assertEqual(calculate_project_progress(proj), 60)

        # 9. Agreement signed +10
        ProjectAgreement.objects.create(
            project=proj,
            status=ProjectAgreement.Status.SIGNED,
            signed_at=timezone.now(),
        )
        self.assertEqual(calculate_project_progress(proj), 70)

        # 10. Mid payment PAID +5
        PaymentMilestone.objects.create(
            project=proj,
            type=PaymentMilestone.Type.MID,
            percentage=30,
            amount=Decimal("300.00"),
            status=PaymentMilestone.Status.PAID,
            paid_at=timezone.now(),
        )
        self.assertEqual(calculate_project_progress(proj), 75)

        # 11. Final deliverables shared +10
        Deliverable.objects.create(
            project=proj,
            title="Logo Files",
            status=Deliverable.Status.SHARED,
        )
        self.assertEqual(calculate_project_progress(proj), 85)

        # 12. Final payment PAID +10
        PaymentMilestone.objects.create(
            project=proj,
            type=PaymentMilestone.Type.FINAL,
            percentage=40,
            amount=Decimal("400.00"),
            status=PaymentMilestone.Status.PAID,
            paid_at=timezone.now(),
        )
        self.assertEqual(calculate_project_progress(proj), 95)

        # 13. Client final sign-off +5
        proj.client_signed_off = True
        proj.save()
        self.assertEqual(calculate_project_progress(proj), 100)

    def test_incomplete_empty_records_do_not_count(self):
        proj = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Empty Records Project",
            company_name="Empty Co",
            sector="Services",
        )
        from .models import ClientProfile, BrandDNA
        ClientProfile.objects.create(project=proj)  # all blank fields
        BrandDNA.objects.create(project=proj)       # all blank fields

        self.assertEqual(calculate_project_progress(proj), 0)

    def test_draft_or_rejected_concepts_do_not_count(self):
        proj = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Draft Concept Project",
            company_name="Draft Co",
            sector="Tech",
        )
        Concept.objects.create(
            project=proj,
            title="Draft Concept",
            status=Concept.Status.DRAFT,
        )
        Concept.objects.create(
            project=proj,
            title="Changes Requested Concept",
            status=Concept.Status.CHANGES_REQUESTED,
        )

        self.assertEqual(calculate_project_progress(proj), 0)

    def test_one_pending_mandatory_stage_prevents_100(self):
        self.project.client_signed_off = True
        self.project.save()

        # Approved concept (15) + Sign-off (5) = 20, less than 100
        self.assertLess(calculate_project_progress(self.project), 100)

    def test_serializers_and_dashboard_return_same_progress(self):
        from .serializers import ProjectSerializer, ClientPortalProjectSerializer
        proj_ser = ProjectSerializer(self.project).data
        portal_ser = ClientPortalProjectSerializer(self.project).data
        calc_val = calculate_project_progress(self.project)

        self.assertEqual(proj_ser["progress"], calc_val)
        self.assertEqual(portal_ser["progress"], calc_val)


class ProjectAssistantChatEndpointTests(TestCase):
    def setUp(self):
        self.consultant = Consultant.objects.create_user(
            email="assistant@example.com",
            name="Assistant",
            password="pass12345",
        )
        self.other_consultant = Consultant.objects.create_user(
            email="assistant-other@example.com",
            name="Other Assistant",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Client",
            email="assistant-client@example.com",
            company_name="Client Co",
            sector="Branding",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Assistant Project",
            company_name="Assistant Co",
            sector="Retail",
            project_value=Decimal("500.00"),
        )
        self.archived_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Archived Assistant Project",
            company_name="Archived Co",
            sector="Retail",
            is_archived=True,
        )
        self.api_client = APIClient()
        self.url = reverse(
            "project-assistant-chat",
            kwargs={"project_id": self.project.id},
        )

    def authenticate(self, user=None):
        self.api_client.force_authenticate(user=user or self.consultant)

    def test_route_resolves_to_expected_path(self):
        self.assertEqual(
            self.url,
            f"/api/projects/{self.project.id}/assistant/chat/",
        )

    @patch("projects.views.generate_response")
    def test_authenticated_owned_project_returns_gemini_response(self, generate_response):
        generate_response.return_value = "Discovery is ready to review."
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {
                "message": "Summarize the client Discovery",
                "project": {"portal_token": "frontend-forged-token"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["project_id"], self.project.id)
        self.assertEqual(response.data["response"], "Discovery is ready to review.")
        self.assertEqual(response.data["provider"], "gemini")
        self.assertIn("project", response.data["sources"])
        self.assertIn("workflow", response.data["sources"])

        prompt = generate_response.call_args.args[0]
        self.assertIn("Assistant Project", prompt)
        self.assertIn("Summarize the client Discovery", prompt)
        self.assertNotIn("frontend-forged-token", prompt)

    def test_unauthenticated_request_is_rejected(self):
        response = self.api_client.post(
            self.url,
            {"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, 401)

    def test_other_consultant_project_returns_404(self):
        self.authenticate(self.other_consultant)

        response = self.api_client.post(
            self.url,
            {"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_archived_project_returns_404(self):
        self.authenticate()
        url = reverse(
            "project-assistant-chat",
            kwargs={"project_id": self.archived_project.id},
        )

        response = self.api_client.post(
            url,
            {"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    def test_missing_project_returns_404(self):
        self.authenticate()
        url = reverse("project-assistant-chat", kwargs={"project_id": 999999})

        response = self.api_client.post(
            url,
            {"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)

    @patch("projects.views.generate_response")
    def test_message_must_be_string(self, generate_response):
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": {"text": "Hello"}},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        generate_response.assert_not_called()

    @patch("projects.views.generate_response")
    def test_message_must_not_be_blank(self, generate_response):
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": "   "},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        generate_response.assert_not_called()

    @patch("projects.views.generate_response")
    def test_message_length_is_limited(self, generate_response):
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": "x" * 701},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        generate_response.assert_not_called()

    @patch("projects.views.generate_response")
    def test_provider_error_is_sanitized(self, generate_response):
        generate_response.side_effect = GeminiProviderError("raw provider secret")
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": "What should I do next?"},
            format="json",
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Gemini service is temporarily unavailable.")
        self.assertNotIn("raw provider secret", response.data["detail"])

    @patch("projects.views.generate_response")
    def test_rate_limit_maps_to_429(self, generate_response):
        generate_response.side_effect = GeminiRateLimitError()
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": "What should I do next?"},
            format="json",
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["detail"], "Gemini API rate limit or quota was reached.")

    @patch("projects.views.generate_response")
    @patch("projects.views.build_project_context")
    def test_pure_greetings_return_short_circuit_response_without_calling_gemini(
        self, build_project_context, generate_response
    ):
        self.authenticate()

        greeting_samples = ["hy", "HI", "hello!", "  good   morning  ", "greetings"]
        for sample in greeting_samples:
            response = self.api_client.post(
                self.url,
                {"message": sample},
                format="json",
            )

            self.assertEqual(response.status_code, 200)
            self.assertIn("Hello! How can I help you with the", response.data["response"])
            self.assertEqual(response.data["provider"], "assistant")
            self.assertEqual(response.data["sources"], ["project"])

        generate_response.assert_not_called()
        build_project_context.assert_not_called()

    @patch("projects.views.generate_response")
    def test_greeting_with_question_is_passed_to_intent_classification_and_gemini(
        self, generate_response
    ):
        from projects.views import _project_assistant_prompt_intent

        generate_response.return_value = "Payment status is locked."
        self.authenticate()

        response = self.api_client.post(
            self.url,
            {"message": "hi what is the payment status?"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["provider"], "gemini")
        generate_response.assert_called_once()
        self.assertEqual(_project_assistant_prompt_intent("hi what is the payment status?"), "payment")

        self.assertEqual(_project_assistant_prompt_intent("hello show pending deliverables"), "deliverable")


class ProjectCreationEmailDeliveryTests(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.consultant = Consultant.objects.create_user(
            email="consultant-invite@example.com",
            name="Consultant Invite",
            password="password12345",
        )
        self.api_client.force_authenticate(user=self.consultant)
        self.url = reverse("project-list-create")
        self.payload = {
            "client": "Acme Client",
            "email": "acme-client@example.com",
            "company": "Acme Corp",
            "sector": "Branding",
            "value": "15000.00",
            "portal_password": "SecurePassword123!",
            "advance": 50,
            "mid": 25,
            "final": 25,
            "revisions": "3 revisions",
        }

    @patch("projects.views.send_mail")
    def test_project_creation_sends_email_synchronously_to_client_email(self, mock_send_mail):
        response = self.api_client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("portal_password", response.data)
        mock_send_mail.assert_called_once()

        args, kwargs = mock_send_mail.call_args
        self.assertEqual(args[3], ["acme-client@example.com"])
        self.assertIn("Your FLOXA portal is ready for Acme Corp", args[0])
        self.assertIn("SecurePassword123!", args[1])

    @patch("projects.views.send_mail", side_effect=Exception("SMTP Connection Error"))
    def test_smtp_failure_does_not_prevent_project_creation_or_duplicate_projects(self, mock_send_mail):
        initial_count = Project.objects.count()

        response = self.api_client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Project.objects.count(), initial_count + 1)
        created_project = Project.objects.get(id=response.data["id"])
        self.assertEqual(created_project.company_name, "Acme Corp")
        self.assertEqual(created_project.client.email, "acme-client@example.com")


    def test_moodboard_prompt_preserves_brand_dna_when_context_is_large(self):
        context = self.large_assistant_context()

        prompt = _build_project_assistant_prompt(context, "Suggest moodboard directions")

        self.assertLessEqual(len(prompt), PROJECT_ASSISTANT_PROMPT_MAX_LENGTH)
        self.assertIn("Quality Seeker", prompt)
        self.assertIn("visual_direction_summary", prompt)
        self.assertIn("target_customer", prompt)
        self.assertIn("Give 3 concise visual direction ideas", prompt)
        self.assertIn("Do not answer with a project status summary unless asked", prompt)

    def test_concept_prompt_preserves_brand_context_when_context_is_large(self):
        context = self.large_assistant_context()

        prompt = _build_project_assistant_prompt(context, "Give me concepts ideas")

        self.assertLessEqual(len(prompt), PROJECT_ASSISTANT_PROMPT_MAX_LENGTH)
        self.assertIn("Quality Seeker", prompt)
        self.assertIn("visual_direction_summary", prompt)
        self.assertIn("concepts", prompt)
        self.assertIn("Give 3 concise concept directions", prompt)
        self.assertNotIn("sources_available", prompt)

    def test_next_action_prompt_keeps_workflow_and_relevant_sections(self):
        context = self.large_assistant_context()

        prompt = _build_project_assistant_prompt(context, "What should I do next?")

        self.assertLessEqual(len(prompt), _get_project_assistant_prompt_max_length())
        self.assertIn("workflow", prompt)
        self.assertIn("recommend one clear next action", prompt)
        self.assertIn("payments", prompt)
        self.assertNotIn("sources_available", prompt)

    def test_large_brand_dna_and_discovery_produce_valid_json(self):
        context = self.large_assistant_context()
        context["brand_dna"]["business_summary"] = "Very long business summary text. " * 300
        context["brand_dna"]["visual_direction_summary"] = "Very detailed visual direction text. " * 300
        context["discovery"]["answers"]["target_customer"] = "Extremely thorough discovery description. " * 300

        prompt = _build_project_assistant_prompt(context, "Tell me about the Brand DNA")

        self.assertLessEqual(len(prompt), _get_project_assistant_prompt_max_length())

        json_start = prompt.find("FLOXA project context:\n") + len("FLOXA project context:\n")
        json_end = prompt.find("\n\nConsultant question:")
        json_str = prompt[json_start:json_end]

        parsed = json.loads(json_str)
        self.assertIn("brand_dna", parsed)
        self.assertIsInstance(parsed["brand_dna"], dict)

    @override_settings(GEMINI_MAX_INPUT_CHARACTERS=1500)
    def test_prompt_stays_within_configured_input_limit_and_preserves_valid_json(self):
        context = self.large_assistant_context()
        context["brand_dna"]["business_summary"] = "Long text " * 100

        prompt = _build_project_assistant_prompt(context, "Summarize Brand DNA")

        max_allowed = _get_project_assistant_prompt_max_length()
        self.assertLessEqual(len(prompt), max_allowed)

        json_start = prompt.find("FLOXA project context:\n") + len("FLOXA project context:\n")
        json_end = prompt.find("\n\nConsultant question:")
        json_str = prompt[json_start:json_end]

        parsed = json.loads(json_str)
        self.assertIsInstance(parsed, dict)

    def test_long_user_questions_handled_safely(self):
        context = self.large_assistant_context()
        long_question = "Explain " + ("the brand strategy and project direction " * 20)
        long_question = long_question[:700]

        prompt = _build_project_assistant_prompt(context, long_question)

        self.assertLessEqual(len(prompt), _get_project_assistant_prompt_max_length())
        self.assertIn(long_question, prompt)

        json_start = prompt.find("FLOXA project context:\n") + len("FLOXA project context:\n")
        json_end = prompt.find("\n\nConsultant question:")
        json_str = prompt[json_start:json_end]

        parsed = json.loads(json_str)
        self.assertIsInstance(parsed, dict)

    def test_no_raw_slicing_or_mid_key_truncation_under_tight_limit(self):
        context = self.large_assistant_context()

        with override_settings(GEMINI_MAX_INPUT_CHARACTERS=800):
            prompt = _build_project_assistant_prompt(context, "What next?")

            self.assertIn("Consultant question:", prompt)
            self.assertTrue(prompt.endswith("What next?"))

            json_start = prompt.find("FLOXA project context:\n") + len("FLOXA project context:\n")
            json_end = prompt.find("\n\nConsultant question:")
            json_str = prompt[json_start:json_end]

            parsed = json.loads(json_str)
            self.assertIn("project", parsed)
            self.assertIn("workflow", parsed)

    def large_assistant_context(self):
        return {
            "project": {
                "title": "Assistant Project",
                "company_name": "Assistant Co",
                "sector": "Retail",
            },
            "workflow": {
                "status": "moodboards",
                "progress": 50,
            },
            "client_profile": {
                "available": True,
                "industry": "Premium retail",
                "location": "India",
            },
            "discovery": {
                "available": True,
                "submitted": True,
                "answers": {
                    "target_customer": "Quality-focused buyers who want a confident and polished brand experience.",
                    "brand_feeling": "Trustworthy, refined, sharp, vibrant, and easy to choose.",
                    "why_choose_us": "The brand has a clear quality-first promise and strong service focus.",
                },
                "visual_styles": ["Clean", "Premium", "Modern"],
                "emotions": ["Trust", "Confidence", "Energy"],
            },
            "brand_dna": {
                "available": True,
                "brand_personality_cluster": "Quality Seeker",
                "business_summary": "Assistant Co should be presented as a focused quality-first retail brand.",
                "target_audience_summary": "The brand should speak to buyers who care about reliability and polish.",
                "positioning_summary": "Position the brand around practical quality, confidence, and trust.",
                "brand_feeling_summary": "The brand should feel refined, vibrant, sharp, and credible.",
                "visual_direction_summary": "Use clean structure, premium spacing, confident contrast, and focused imagery.",
                "competitor_summary": "Avoid generic retail sameness and unclear visual signals.",
            },
            "moodboards": {
                "count": 1,
                "selected": None,
                "items": [
                    {
                        "title": "Existing direction",
                        "description": "A long moodboard description " * 30,
                        "is_selected": False,
                    }
                ],
            },
            "payments": {
                "milestones": [
                    {"type": "advance", "status": "paid", "amount_display": "Rs49.20"},
                ]
            },
            "recent_activity": {
                "items": [
                    {
                        "action": f"activity_{index}",
                        "description": "Long activity text " * 40,
                    }
                    for index in range(10)
                ]
            },
        }


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_local",
    RAZORPAY_KEY_SECRET="local_secret",
    RAZORPAY_WEBHOOK_SECRET="webhook_secret",
    RAZORPAY_CURRENCY="INR",
)
class RazorpayPaymentVerificationTests(TestCase):
    def setUp(self):
        self.consultant = Consultant.objects.create_user(
            email="payments@example.com",
            name="Payments",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Client",
            email="client@example.com",
            company_name="Client Co",
            sector="Branding",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Payment Project",
            company_name="Payment Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )
        self.api_client = APIClient()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )

    def create_milestone(self, milestone_type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.REQUESTED):
        return PaymentMilestone.objects.create(
            project=self.project,
            type=milestone_type,
            percentage=40 if milestone_type == PaymentMilestone.Type.ADVANCE else 30,
            status=status,
        )

    def create_transaction(self, milestone, order_id="order_test", payment_id="pay_test"):
        transaction_obj = PaymentTransaction.objects.create(
            project=self.project,
            milestone=milestone,
            razorpay_order_id=order_id,
            amount=milestone.amount,
            currency="INR",
            status=PaymentTransaction.Status.CREATED,
        )
        return transaction_obj, payment_id

    def signature(self, order_id, payment_id):
        return hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            f"{order_id}|{payment_id}".encode(),
            hashlib.sha256,
        ).hexdigest()

    def payment_payload(self, transaction_obj, payment_id="pay_test", **overrides):
        payload = {
            "id": payment_id,
            "order_id": transaction_obj.razorpay_order_id,
            "amount": 40000,
            "currency": "INR",
            "status": "captured",
        }
        payload.update(overrides)
        return payload

    def verify(self, order_id, payment_id, signature, headers=None):
        extra = {"HTTP_X_CLIENT_PORTAL_TOKEN": str(self.project.portal_token)}
        if headers is not None:
            extra = headers
        return self.api_client.post(
            f"/api/client-portal/{self.project.portal_token}/payments/verify/",
            {
                "razorpay_order_id": order_id,
                "razorpay_payment_id": payment_id,
                "razorpay_signature": signature,
            },
            format="json",
            **extra
        )

    def test_unsafe_request_with_missing_header_returns_403(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            "signature_placeholder",
            headers={}
        )
        self.assertEqual(response.status_code, 403)

    def test_unsafe_request_with_mismatched_header_returns_403(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            "signature_placeholder",
            headers={"HTTP_X_CLIENT_PORTAL_TOKEN": "mismatched-uuid-token"}
        )
        self.assertEqual(response.status_code, 403)

    def webhook_signature(self, body):
        return hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
            body,
            hashlib.sha256,
        ).hexdigest()

    def webhook_payload(self, transaction_obj, payment_id="pay_test", event_type="payment.captured", **overrides):
        payment = {
            "id": payment_id,
            "order_id": transaction_obj.razorpay_order_id,
            "amount": 40000,
            "currency": "INR",
            "status": "captured",
        }
        payment.update(overrides)

        return {
            "event": event_type,
            "payload": {
                "payment": {
                    "entity": payment,
                },
            },
        }

    def post_webhook(self, payload, event_id="evt_test", signature=None):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return self.api_client.post(
            "/api/payments/razorpay/webhook/",
            body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature or self.webhook_signature(body),
            HTTP_X_RAZORPAY_EVENT_ID=event_id,
        )

    @patch("projects.views.fetch_razorpay_payment")
    def test_valid_captured_payment_verifies_transaction_and_pays_milestone(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        transaction_obj.refresh_from_db()
        milestone.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(transaction_obj.status, PaymentTransaction.Status.VERIFIED)
        self.assertEqual(transaction_obj.razorpay_payment_id, payment_id)
        self.assertIsNotNone(transaction_obj.verified_at)
        self.assertEqual(milestone.status, PaymentMilestone.Status.PAID)
        self.assertIsNotNone(milestone.paid_at)
        self.assertEqual(response.data["milestone"]["id"], milestone.id)
        self.assertNotIn("project", response.data["milestone"])

    @patch("projects.views.fetch_razorpay_payment")
    def test_invalid_signature_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.verify(transaction_obj.razorpay_order_id, payment_id, "invalid")

        transaction_obj.refresh_from_db()
        milestone.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(transaction_obj.status, PaymentTransaction.Status.CREATED)
        self.assertEqual(milestone.status, PaymentMilestone.Status.REQUESTED)
        fetch_payment.assert_not_called()

    @patch("projects.views.fetch_razorpay_payment")
    def test_correct_signature_but_wrong_payment_id_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, "different_payment")

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 400)

    @patch("projects.views.fetch_razorpay_payment")
    def test_correct_signature_but_wrong_order_id_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id, order_id="order_other")

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 400)

    @patch("projects.views.fetch_razorpay_payment")
    def test_amount_mismatch_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id, amount=39999)

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 400)

    @patch("projects.views.fetch_razorpay_payment")
    def test_currency_mismatch_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id, currency="USD")

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 400)

    @patch("projects.views.fetch_razorpay_payment")
    def test_non_captured_payment_status_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id, status="authorized")

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 400)

    @patch("projects.views.fetch_razorpay_payment")
    def test_duplicate_same_payment_verification_is_idempotent(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)
        signature = self.signature(transaction_obj.razorpay_order_id, payment_id)

        first_response = self.verify(transaction_obj.razorpay_order_id, payment_id, signature)
        second_response = self.verify(transaction_obj.razorpay_order_id, payment_id, signature)

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(
            self.project.activities.filter(
                action="payment_received",
                metadata__payment_milestone_id=milestone.id,
            ).count(),
            1,
        )

    @patch("projects.views.fetch_razorpay_payment")
    def test_duplicate_different_payment_id_is_rejected(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)
        self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        response = self.verify(
            transaction_obj.razorpay_order_id,
            "pay_different",
            self.signature(transaction_obj.razorpay_order_id, "pay_different"),
        )

        self.assertEqual(response.status_code, 400)

    def test_post_lock_different_payment_id_raises_completion_error(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        transaction_obj.status = PaymentTransaction.Status.VERIFIED
        transaction_obj.razorpay_payment_id = payment_id
        transaction_obj.verified_at = milestone.created_at
        transaction_obj.save(update_fields=["status", "razorpay_payment_id", "verified_at", "updated_at"])

        with self.assertRaises(PaymentCompletionError):
            complete_payment_milestone(
                milestone,
                actor_type="client",
                payment_source="razorpay",
                transaction_obj=transaction_obj,
                razorpay_payment_id="pay_different",
            )

    def test_manual_mark_paid_still_works(self):
        milestone = self.create_milestone()
        self.api_client.force_authenticate(user=self.consultant)

        response = self.api_client.post(
            f"/api/projects/{self.project.id}/payments/{milestone.id}/mark-paid/"
        )

        milestone.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(milestone.status, PaymentMilestone.Status.PAID)

    @patch("projects.views.fetch_razorpay_payment")
    def test_manual_mark_paid_blocked_after_verified_razorpay(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)
        self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )
        self.api_client.force_authenticate(user=self.consultant)

        response = self.api_client.post(
            f"/api/projects/{self.project.id}/payments/{milestone.id}/mark-paid/"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "This payment has already been verified through Razorpay.")

    def test_only_one_verified_transaction_per_milestone(self):
        milestone = self.create_milestone()
        PaymentTransaction.objects.create(
            project=self.project,
            milestone=milestone,
            razorpay_order_id="order_one",
            razorpay_payment_id="pay_one",
            amount=milestone.amount,
            currency="INR",
            status=PaymentTransaction.Status.VERIFIED,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PaymentTransaction.objects.create(
                    project=self.project,
                    milestone=milestone,
                    razorpay_order_id="order_two",
                    razorpay_payment_id="pay_two",
                    amount=milestone.amount,
                    currency="INR",
                    status=PaymentTransaction.Status.VERIFIED,
                )

    def test_completion_unlocks_next_milestone(self):
        advance = self.create_milestone(PaymentMilestone.Type.ADVANCE)
        mid = self.create_milestone(PaymentMilestone.Type.MID, PaymentMilestone.Status.LOCKED)
        PaymentMilestone.objects.create(
            project=self.project,
            type=PaymentMilestone.Type.FINAL,
            percentage=30,
            status=PaymentMilestone.Status.LOCKED,
        )
        Concept.objects.create(project=self.project, title="Approved Concept", status=Concept.Status.APPROVED)

        complete_payment_milestone(
            advance,
            actor_type="consultant",
            payment_source="manual",
        )

        mid.refresh_from_db()
        self.assertEqual(mid.status, PaymentMilestone.Status.READY)

    def test_valid_payment_captured_webhook_completes_milestone(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(self.webhook_payload(transaction_obj, payment_id))

        transaction_obj.refresh_from_db()
        milestone.refresh_from_db()
        event = RazorpayWebhookEvent.objects.get(razorpay_event_id="evt_test")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(transaction_obj.status, PaymentTransaction.Status.VERIFIED)
        self.assertEqual(transaction_obj.razorpay_payment_id, payment_id)
        self.assertEqual(milestone.status, PaymentMilestone.Status.PAID)
        self.assertEqual(event.processing_status, RazorpayWebhookEvent.ProcessingStatus.PROCESSED)
        self.assertEqual(event.payment_id, payment_id)
        self.assertEqual(event.order_id, transaction_obj.razorpay_order_id)
        self.assertTrue(
            self.project.activities.filter(
                action="payment_received",
                metadata__payment_source="razorpay_webhook",
            ).exists()
        )

    def test_webhook_invalid_signature_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id),
            signature="invalid",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(RazorpayWebhookEvent.objects.exists())

    def test_webhook_missing_signature_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        payload = self.webhook_payload(transaction_obj, payment_id)
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        response = self.api_client.post(
            "/api/payments/razorpay/webhook/",
            body,
            content_type="application/json",
            HTTP_X_RAZORPAY_EVENT_ID="evt_missing_signature",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(RazorpayWebhookEvent.objects.exists())

    def test_webhook_malformed_json_is_rejected(self):
        body = b"{invalid"

        response = self.api_client.post(
            "/api/payments/razorpay/webhook/",
            body,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=self.webhook_signature(body),
            HTTP_X_RAZORPAY_EVENT_ID="evt_bad_json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(RazorpayWebhookEvent.objects.exists())

    def test_unsupported_valid_webhook_event_is_ignored(self):
        payload = {"event": "payment.failed", "payload": {}}

        response = self.post_webhook(payload, event_id="evt_ignored")

        event = RazorpayWebhookEvent.objects.get(razorpay_event_id="evt_ignored")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(event.processing_status, RazorpayWebhookEvent.ProcessingStatus.IGNORED)

    def test_duplicate_webhook_event_returns_ok_without_duplicate_activity(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        payload = self.webhook_payload(transaction_obj, payment_id)

        first_response = self.post_webhook(payload, event_id="evt_duplicate")
        second_response = self.post_webhook(payload, event_id="evt_duplicate")

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(RazorpayWebhookEvent.objects.filter(razorpay_event_id="evt_duplicate").count(), 1)
        self.assertEqual(
            self.project.activities.filter(
                action="payment_received",
                metadata__payment_milestone_id=milestone.id,
            ).count(),
            1,
        )

    @patch("projects.views.fetch_razorpay_payment")
    def test_webhook_after_successful_frontend_verification_is_idempotent(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)
        self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id),
            event_id="evt_after_frontend",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.project.activities.filter(
                action="payment_received",
                metadata__payment_milestone_id=milestone.id,
            ).count(),
            1,
        )

    @patch("projects.views.fetch_razorpay_payment")
    def test_frontend_verification_after_successful_webhook_is_idempotent(self, fetch_payment):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id),
            event_id="evt_before_frontend",
        )
        fetch_payment.return_value = self.payment_payload(transaction_obj, payment_id)

        response = self.verify(
            transaction_obj.razorpay_order_id,
            payment_id,
            self.signature(transaction_obj.razorpay_order_id, payment_id),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.project.activities.filter(
                action="payment_received",
                metadata__payment_milestone_id=milestone.id,
            ).count(),
            1,
        )

    def test_webhook_amount_mismatch_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id, amount=39999),
            event_id="evt_amount_mismatch",
        )

        event = RazorpayWebhookEvent.objects.get(razorpay_event_id="evt_amount_mismatch")
        transaction_obj.refresh_from_db()
        milestone.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(event.processing_status, RazorpayWebhookEvent.ProcessingStatus.FAILED)
        self.assertEqual(transaction_obj.status, PaymentTransaction.Status.CREATED)
        self.assertEqual(milestone.status, PaymentMilestone.Status.REQUESTED)

    def test_webhook_currency_mismatch_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id, currency="USD"),
            event_id="evt_currency_mismatch",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            RazorpayWebhookEvent.objects.get(
                razorpay_event_id="evt_currency_mismatch",
            ).processing_status,
            RazorpayWebhookEvent.ProcessingStatus.FAILED,
        )

    def test_webhook_unknown_order_id_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id, order_id="order_unknown"),
            event_id="evt_unknown_order",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            RazorpayWebhookEvent.objects.get(
                razorpay_event_id="evt_unknown_order",
            ).processing_status,
            RazorpayWebhookEvent.ProcessingStatus.FAILED,
        )

    def test_webhook_non_captured_payment_payload_is_rejected(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id, status="authorized"),
            event_id="evt_not_captured",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            RazorpayWebhookEvent.objects.get(
                razorpay_event_id="evt_not_captured",
            ).processing_status,
            RazorpayWebhookEvent.ProcessingStatus.FAILED,
        )

    def test_webhook_different_payment_id_cannot_replace_verified_payment(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        self.post_webhook(
            self.webhook_payload(transaction_obj, payment_id),
            event_id="evt_original_payment",
        )

        response = self.post_webhook(
            self.webhook_payload(transaction_obj, "pay_different"),
            event_id="evt_different_payment",
        )

        transaction_obj.refresh_from_db()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(transaction_obj.razorpay_payment_id, payment_id)

    def test_webhook_unique_event_id_constraint(self):
        RazorpayWebhookEvent.objects.create(
            razorpay_event_id="evt_unique",
            event_type="payment.captured",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                RazorpayWebhookEvent.objects.create(
                    razorpay_event_id="evt_unique",
                    event_type="payment.captured",
                )

    def test_helper_rejects_failed_online_transaction(self):
        milestone = self.create_milestone()
        transaction_obj, payment_id = self.create_transaction(milestone)
        transaction_obj.status = PaymentTransaction.Status.FAILED
        transaction_obj.save(update_fields=["status", "updated_at"])

        with self.assertRaises(PaymentCompletionError):
            complete_payment_milestone(
                milestone,
                actor_type="client",
                payment_source="razorpay_webhook",
                transaction_obj=transaction_obj,
                razorpay_payment_id=payment_id,
            )


def create_test_image_bytes(width=300, height=300, color="red", format="JPEG"):
    from io import BytesIO
    from PIL import Image
    buf = BytesIO()
    img = Image.new("RGB", (width, height), color=color)
    img.save(buf, format=format)
    return buf.getvalue()


class PrivateMediaHardeningTests(TestCase):
    def setUp(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.consultant = Consultant.objects.create_user(
            email="consultant_media@example.com",
            name="Consultant Media",
            password="pass12345",
        )
        self.other_consultant = Consultant.objects.create_user(
            email="other_media@example.com",
            name="Other Consultant Media",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Client Media",
            email="client_media@example.com",
            company_name="Client Co Media",
            sector="Design",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Media Project",
            company_name="Media Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )
        self.other_project = Project.objects.create(
            consultant=self.other_consultant,
            client=self.client_record,
            title="Other Media Project",
            company_name="Other Media Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )
        self.test_image_data = create_test_image_bytes(300, 300, color="red")
        self.moodboard = Moodboard.objects.create(
            project=self.project,
            title="Moodboard 1",
            image=SimpleUploadedFile("moodboard.jpg", self.test_image_data, content_type="image/jpeg"),
        )
        self.concept = Concept.objects.create(
            project=self.project,
            title="Concept 1",
            image=SimpleUploadedFile("concept.jpg", self.test_image_data, content_type="image/jpeg"),
            file=SimpleUploadedFile("concept.pdf", b"pdf_data", content_type="application/pdf"),
            status=Concept.Status.SHARED,
        )
        self.agreement = Agreement.objects.create(
            project=self.project,
            title="Agreement 1",
            file=SimpleUploadedFile("agreement.pdf", b"pdf_data", content_type="application/pdf"),
        )
        self.api_client = APIClient()

    def test_consultant_asset_access_succeeds(self):
        self.api_client.force_authenticate(user=self.consultant)
        
        # Moodboard image
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/moodboards/{self.moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.test_image_data)

        # Concept image
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/concepts/{self.concept.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.test_image_data)

        # Concept file
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/concepts/{self.concept.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"pdf_data")

        # Agreement file
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/agreement/{self.agreement.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"pdf_data")

    def test_consultant_access_to_other_consultants_project_is_denied(self):
        self.api_client.force_authenticate(user=self.other_consultant)

        # Moodboard image
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/moodboards/{self.moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 404)

        # Concept image
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/concepts/{self.concept.id}/image/"
        )
        self.assertEqual(response.status_code, 404)

        # Concept file
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/concepts/{self.concept.id}/file/"
        )
        self.assertEqual(response.status_code, 404)

        # Agreement file
        response = self.api_client.get(
            f"/api/projects/{self.project.id}/agreement/{self.agreement.id}/file/"
        )
        self.assertEqual(response.status_code, 404)

    def test_client_portal_asset_access_succeeds_with_valid_cookie(self):
        from .views import sign_portal_access_token
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )
        
        # Moodboard image preview
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{self.moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/jpeg")
        self.assertEqual(response.headers["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Content-Disposition"], "inline")
        self.assertNotEqual(response.content, self.test_image_data)

        # Concept image preview
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/concepts/{self.concept.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/jpeg")
        self.assertNotEqual(response.content, self.test_image_data)

        # Concept file
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/concepts/{self.concept.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"pdf_data")

        # Agreement file
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/agreement/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"pdf_data")

    def test_client_portal_asset_access_fails_with_invalid_cookie(self):
        from .views import sign_portal_access_token
        # Mismatched/invalid portal token
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.other_project.portal_token
        )

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{self.moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 403)

        # Missing cookie
        self.api_client.cookies.clear()
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{self.moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 403)

    def test_raw_media_urls_are_not_returned_by_serializers(self):
        from .serializers import (
            MoodboardSerializer,
            ClientPortalMoodboardSerializer,
            ConsultantConceptSerializer,
            ClientPortalConceptSerializer,
            ConsultantAgreementSerializer,
            ClientPortalAgreementSerializer,
        )
        from rest_framework.test import APIRequestFactory
        request = APIRequestFactory().get("/")
        
        # Moodboard image url
        ser = MoodboardSerializer(self.moodboard, context={"request": request})
        self.assertNotIn("/media/", ser.data["image_url"])
        self.assertIn("/moodboards/", ser.data["image_url"])

        # Client Portal Moodboard image url
        ser = ClientPortalMoodboardSerializer(self.moodboard, context={"request": request})
        self.assertNotIn("/media/", ser.data["image_url"])
        self.assertIn("/moodboards/", ser.data["image_url"])

        # Concept urls
        ser = ConsultantConceptSerializer(self.concept, context={"request": request})
        self.assertNotIn("/media/", ser.data["image_url"])
        self.assertNotIn("/media/", ser.data["file_url"])

        ser = ClientPortalConceptSerializer(self.concept, context={"request": request})
        self.assertNotIn("/media/", ser.data["image_url"])
        self.assertNotIn("/media/", ser.data["file_url"])

        # Agreement urls
        ser = ConsultantAgreementSerializer(self.agreement, context={"request": request})
        self.assertNotIn("/media/", ser.data["file_url"])
        self.assertIn("/agreement/", ser.data["file_url"])

        ser = ClientPortalAgreementSerializer(self.agreement, context={"request": request})
        self.assertNotIn("/media/", ser.data["file_url"])
        self.assertIn("/agreement/", ser.data["file_url"])


class ClientPortalWatermarkedPreviewTests(TestCase):
    def setUp(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .views import sign_portal_access_token
        self.consultant = Consultant.objects.create_user(
            email="preview_consultant@example.com",
            name="Preview Consultant",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Preview Client",
            email="preview_client@example.com",
            company_name="Acme Design Co",
            sector="Design",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Preview Project",
            company_name="Acme Design Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )
        self.other_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Other Preview Project",
            company_name="Other Design Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )

        self.large_image_data = create_test_image_bytes(2000, 1500, color="green")
        self.small_image_data = create_test_image_bytes(200, 200, color="blue")

        self.large_moodboard = Moodboard.objects.create(
            project=self.project,
            title="Large Moodboard",
            image=SimpleUploadedFile("large_moodboard.jpg", self.large_image_data, content_type="image/jpeg"),
        )
        self.small_moodboard = Moodboard.objects.create(
            project=self.project,
            title="Small Moodboard",
            image=SimpleUploadedFile("small_moodboard.jpg", self.small_image_data, content_type="image/jpeg"),
        )
        self.concept = Concept.objects.create(
            project=self.project,
            title="Concept Route",
            image=SimpleUploadedFile("concept.jpg", self.large_image_data, content_type="image/jpeg"),
            status=Concept.Status.SHARED,
        )
        self.other_concept = Concept.objects.create(
            project=self.other_project,
            title="Other Project Concept",
            image=SimpleUploadedFile("other.jpg", self.small_image_data, content_type="image/jpeg"),
            status=Concept.Status.SHARED,
        )

        self.api_client = APIClient()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )

    def test_client_fetches_moodboard_preview_and_dimensions_are_constrained(self):
        from PIL import Image
        from io import BytesIO

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{self.large_moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/jpeg")
        self.assertEqual(response.headers["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Content-Disposition"], "inline")

        preview_img = Image.open(BytesIO(response.content))
        self.assertLessEqual(preview_img.width, 1400)
        self.assertLessEqual(preview_img.height, 1400)
        self.assertNotEqual(response.content, self.large_image_data)

    def test_smaller_images_are_not_upscaled(self):
        from PIL import Image
        from io import BytesIO

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{self.small_moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        preview_img = Image.open(BytesIO(response.content))
        self.assertEqual(preview_img.width, 200)
        self.assertEqual(preview_img.height, 200)

    def test_client_fetches_concept_preview(self):
        from PIL import Image
        from io import BytesIO

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/concepts/{self.concept.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Content-Type"], "image/jpeg")
        preview_img = Image.open(BytesIO(response.content))
        self.assertIsNotNone(preview_img)
        self.assertNotEqual(response.content, self.large_image_data)

    def test_cross_project_image_access_is_prevented(self):
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/concepts/{self.other_concept.id}/image/"
        )
        self.assertEqual(response.status_code, 404)

    def test_corrupt_image_returns_controlled_404(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        corrupt_moodboard = Moodboard.objects.create(
            project=self.project,
            title="Corrupt Moodboard",
            image=SimpleUploadedFile("corrupt.jpg", b"not_a_valid_image", content_type="image/jpeg"),
        )
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/moodboards/{corrupt_moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Asset not found."})

    def test_consultant_endpoint_returns_unaltered_original(self):
        self.api_client.force_authenticate(user=self.consultant)

        response = self.api_client.get(
            f"/api/projects/{self.project.id}/moodboards/{self.large_moodboard.id}/image/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.large_image_data)


class ClientPortalPhase3DeliverableReleaseTests(TestCase):
    def setUp(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .views import sign_portal_access_token

        self.consultant = Consultant.objects.create_user(
            email="phase3_consultant@example.com",
            name="Phase 3 Consultant",
            password="pass12345",
        )
        self.client_record = Client.objects.create(
            name="Phase 3 Client",
            email="phase3_client@example.com",
            company_name="Phase 3 Co",
            sector="Design",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Phase 3 Project",
            company_name="Phase 3 Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )
        self.other_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Other Phase 3 Project",
            company_name="Other Co",
            sector="Retail",
            project_value=Decimal("1000.00"),
            advance_percentage=40,
            mid_percentage=30,
            final_percentage=30,
        )

        self.deliverable_file_bytes = b"FINAL_DELIVERABLE_ORIGINAL_BYTES_XYZ"
        self.deliverable = Deliverable.objects.create(
            project=self.project,
            title="Final Brand Package",
            description="Logo and brand guidelines",
            file=SimpleUploadedFile("brand_package.zip", self.deliverable_file_bytes, content_type="application/zip"),
            status=Deliverable.Status.SHARED,
        )
        self.draft_deliverable = Deliverable.objects.create(
            project=self.project,
            title="Draft Deliverable",
            description="Draft",
            file=SimpleUploadedFile("draft.zip", b"DRAFT_BYTES", content_type="application/zip"),
            status=Deliverable.Status.DRAFT,
        )
        self.other_deliverable = Deliverable.objects.create(
            project=self.other_project,
            title="Other Project Deliverable",
            description="Other",
            file=SimpleUploadedFile("other.zip", b"OTHER_BYTES", content_type="application/zip"),
            status=Deliverable.Status.SHARED,
        )

        self.advance_pm, _ = PaymentMilestone.objects.get_or_create(
            project=self.project,
            type=PaymentMilestone.Type.ADVANCE,
            defaults={"percentage": 40, "amount": Decimal("400.00"), "status": PaymentMilestone.Status.LOCKED},
        )
        self.mid_pm, _ = PaymentMilestone.objects.get_or_create(
            project=self.project,
            type=PaymentMilestone.Type.MID,
            defaults={"percentage": 30, "amount": Decimal("300.00"), "status": PaymentMilestone.Status.LOCKED},
        )
        self.final_pm, _ = PaymentMilestone.objects.get_or_create(
            project=self.project,
            type=PaymentMilestone.Type.FINAL,
            defaults={"percentage": 30, "amount": Decimal("300.00"), "status": PaymentMilestone.Status.LOCKED},
        )

        self.api_client = APIClient()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )

    def test_locked_serializer_omits_file_url_and_exposes_locked_reason(self):
        from .serializers import ClientPortalDeliverableSerializer
        from rest_framework.test import APIRequestFactory

        request = APIRequestFactory().get("/")
        ser = ClientPortalDeliverableSerializer(self.deliverable, context={"request": request})

        self.assertFalse(ser.data["can_download"])
        self.assertIsNone(ser.data["file_url"])
        self.assertIn("Final files will be available", ser.data["download_locked_reason"])
        self.assertNotIn("/media/", str(ser.data))

    def test_download_denied_when_final_payment_milestone_unpaid(self):
        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.REQUESTED
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "Final files will be available after the required payment is confirmed."})

    def test_download_denied_when_final_is_paid_but_advance_is_unpaid(self):
        self.advance_pm.status = PaymentMilestone.Status.REQUESTED
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_denied_for_draft_unshared_deliverable(self):
        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.draft_deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_denied_for_deliverable_of_another_project(self):
        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.other_deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 404)

    def test_download_denied_for_invalid_cookie(self):
        self.api_client.cookies.clear()
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_succeeds_when_all_payments_paid_and_deliverable_shared(self):
        from .serializers import ClientPortalDeliverableSerializer
        from rest_framework.test import APIRequestFactory

        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        request = APIRequestFactory().get("/")
        ser = ClientPortalDeliverableSerializer(self.deliverable, context={"request": request})
        self.assertTrue(ser.data["can_download"])
        self.assertIsNotNone(ser.data["file_url"])
        self.assertNotIn("/media/", ser.data["file_url"])

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.deliverable_file_bytes)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(response.headers["Pragma"], "no-cache")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertIn("brand_package", response.headers["Content-Disposition"])

    def test_consultant_endpoint_returns_unlocked_file_regardless_of_payment(self):
        self.api_client.force_authenticate(user=self.consultant)

        self.final_pm.status = PaymentMilestone.Status.REQUESTED
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/projects/{self.project.id}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.deliverable_file_bytes)


class ClientPortalDiscoveryReportTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.hashers import make_password
        from .models import (
            Client,
            ClientProfile,
            DiscoveryCompetitor,
            DiscoveryEmotion,
            DiscoverySliderResponse,
            DiscoveryVisualStyle,
            Project,
            ProjectDiscovery,
        )

        User = get_user_model()

        self.consultant = User.objects.create_user(
            email="consultant_disc@example.com",
            name="Consultant Disc",
            password="TestPassword123!",
        )
        self.client_obj = Client.objects.create(
            name="Client Disc",
            email="client_disc@example.com",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Acme Discovery Co",
            sector="Technology",
            project_value=Decimal("10000.00"),
            portal_password_hash=make_password("portalpass123"),
        )
        self.other_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Other Co",
            sector="Retail",
            project_value=Decimal("5000.00"),
            portal_password_hash=make_password("portalpass123"),
        )

        self.discovery = ProjectDiscovery.objects.create(
            project=self.project,
            what_business_does="We build brand clarity software.",
            target_customer="Modern design consultants and agency owners.",
            why_choose_us="Unmatched clarity and speed.",
            brand_feeling="Confident, elegant, and precise.",
            audience_archetype="Premium Seeker",
            submitted_at=timezone.now(),
        )
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Confident")
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Elegant")
        DiscoveryVisualStyle.objects.create(discovery=self.discovery, style="Clean & Minimal")
        DiscoveryCompetitor.objects.create(
            discovery=self.discovery,
            name="CompA",
            rating="High",
            reason="Market leader",
        )

        self.api_client = APIClient()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )

    def test_client_portal_can_retrieve_submitted_discovery_report(self):
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["what_business_does"], "We build brand clarity software.")
        self.assertEqual(response.data["target_customer"], "Modern design consultants and agency owners.")
        self.assertTrue(response.data["is_submitted"])
        self.assertIsNotNone(response.data["submitted_at"])

        emotions = [item["emotion"] for item in response.data["emotions"]]
        self.assertIn("Confident", emotions)
        self.assertIn("Elegant", emotions)

    def test_submitted_discovery_remains_available_after_brand_dna_generation(self):
        self.api_client.force_authenticate(user=self.consultant)
        gen_response = self.api_client.post(
            f"/api/projects/{self.project.id}/brand-dna/generate/"
        )
        self.assertEqual(gen_response.status_code, 200)

        self.api_client.logout()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        disc_response = self.api_client.get(url)

        self.assertEqual(disc_response.status_code, 200)
        self.assertEqual(disc_response.data["what_business_does"], "We build brand clarity software.")
        self.assertTrue(disc_response.data["is_submitted"])

    def test_other_project_portal_token_cannot_access_discovery(self):
        other_cookie_client = APIClient()
        other_cookie_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.other_project.portal_token
        )
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        response = other_cookie_client.get(url)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "Final files will be available after the required payment is confirmed."})

    def test_download_denied_when_final_is_paid_but_advance_is_unpaid(self):
        self.advance_pm.status = PaymentMilestone.Status.REQUESTED
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_denied_for_draft_unshared_deliverable(self):
        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.draft_deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_denied_for_deliverable_of_another_project(self):
        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.other_deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 404)

    def test_download_denied_for_invalid_cookie(self):
        self.api_client.cookies.clear()
        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 403)

    def test_download_succeeds_when_all_payments_paid_and_deliverable_shared(self):
        from .serializers import ClientPortalDeliverableSerializer
        from rest_framework.test import APIRequestFactory

        self.advance_pm.status = PaymentMilestone.Status.PAID
        self.advance_pm.save()
        self.mid_pm.status = PaymentMilestone.Status.PAID
        self.mid_pm.save()
        self.final_pm.status = PaymentMilestone.Status.PAID
        self.final_pm.save()

        request = APIRequestFactory().get("/")
        ser = ClientPortalDeliverableSerializer(self.deliverable, context={"request": request})
        self.assertTrue(ser.data["can_download"])
        self.assertIsNotNone(ser.data["file_url"])
        self.assertNotIn("/media/", ser.data["file_url"])

        response = self.api_client.get(
            f"/api/client-portal/{self.project.portal_token}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.deliverable_file_bytes)
        self.assertEqual(response.headers["Cache-Control"], "private, no-store, max-age=0")
        self.assertEqual(response.headers["Pragma"], "no-cache")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertIn("brand_package", response.headers["Content-Disposition"])

    def test_consultant_endpoint_returns_unlocked_file_regardless_of_payment(self):
        self.api_client.force_authenticate(user=self.consultant)

        self.final_pm.status = PaymentMilestone.Status.REQUESTED
        self.final_pm.save()

        response = self.api_client.get(
            f"/api/projects/{self.project.id}/deliverables/{self.deliverable.id}/file/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), self.deliverable_file_bytes)


class ClientPortalDiscoveryReportTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.hashers import make_password
        from .models import (
            Client,
            ClientProfile,
            DiscoveryCompetitor,
            DiscoveryEmotion,
            DiscoverySliderResponse,
            DiscoveryVisualStyle,
            Project,
            ProjectDiscovery,
        )

        User = get_user_model()

        self.consultant = User.objects.create_user(
            email="consultant_disc@example.com",
            name="Consultant Disc",
            password="TestPassword123!",
        )
        self.client_obj = Client.objects.create(
            name="Client Disc",
            email="client_disc@example.com",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Acme Discovery Co",
            sector="Technology",
            project_value=Decimal("10000.00"),
            portal_password_hash=make_password("portalpass123"),
        )
        self.other_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Other Co",
            sector="Retail",
            project_value=Decimal("5000.00"),
            portal_password_hash=make_password("portalpass123"),
        )

        self.discovery = ProjectDiscovery.objects.create(
            project=self.project,
            what_business_does="We build brand clarity software.",
            target_customer="Modern design consultants and agency owners.",
            why_choose_us="Unmatched clarity and speed.",
            brand_feeling="Confident, elegant, and precise.",
            audience_archetype="Premium Seeker",
            submitted_at=timezone.now(),
        )
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Confident")
        DiscoveryEmotion.objects.create(discovery=self.discovery, emotion="Elegant")
        DiscoveryVisualStyle.objects.create(discovery=self.discovery, style="Clean & Minimal")
        DiscoveryCompetitor.objects.create(
            discovery=self.discovery,
            name="CompA",
            rating="High",
            reason="Market leader",
        )

        self.api_client = APIClient()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )

    def test_client_portal_can_retrieve_submitted_discovery_report(self):
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["what_business_does"], "We build brand clarity software.")
        self.assertEqual(response.data["target_customer"], "Modern design consultants and agency owners.")
        self.assertTrue(response.data["is_submitted"])
        self.assertIsNotNone(response.data["submitted_at"])

        emotions = [item["emotion"] for item in response.data["emotions"]]
        self.assertIn("Confident", emotions)
        self.assertIn("Elegant", emotions)

    def test_submitted_discovery_remains_available_after_brand_dna_generation(self):
        self.api_client.force_authenticate(user=self.consultant)
        gen_response = self.api_client.post(
            f"/api/projects/{self.project.id}/brand-dna/generate/"
        )
        self.assertEqual(gen_response.status_code, 200)

        self.api_client.logout()
        self.api_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.project.portal_token
        )
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        disc_response = self.api_client.get(url)

        self.assertEqual(disc_response.status_code, 200)
        self.assertEqual(disc_response.data["what_business_does"], "We build brand clarity software.")
        self.assertTrue(disc_response.data["is_submitted"])

    def test_other_project_portal_token_cannot_access_discovery(self):
        other_cookie_client = APIClient()
        other_cookie_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            self.other_project.portal_token
        )
        url = f"/api/client-portal/{self.project.portal_token}/discovery/"
        response = other_cookie_client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_draft_unsubmitted_discovery_marked_is_submitted_false(self):
        from django.contrib.auth.hashers import make_password
        from .models import ProjectDiscovery

        draft_project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Draft Co",
            sector="Design",
            project_value=Decimal("4000.00"),
            portal_password_hash=make_password("portalpass123"),
        )
        draft_disc = ProjectDiscovery.objects.create(
            project=draft_project,
            what_business_does="In progress business...",
            submitted_at=None,
        )

        draft_client = APIClient()
        draft_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(
            draft_project.portal_token
        )
        url = f"/api/client-portal/{draft_project.portal_token}/discovery/"
        response = draft_client.get(url)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_submitted"])
        self.assertIsNone(response.data["submitted_at"])


class MoodboardStorageTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.hashers import make_password
        from .models import Client, Project, Moodboard

        User = get_user_model()
        self.consultant = User.objects.create_user(
            email="consultant_mb@example.com",
            name="Consultant MB",
            password="TestPassword123!",
        )
        self.other_consultant = User.objects.create_user(
            email="other_mb@example.com",
            name="Other Consultant",
            password="TestPassword123!",
        )
        self.client_obj = Client.objects.create(
            name="Client MB",
            email="client_mb@example.com",
        )
        self.project = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            company_name="Acme Moodboards",
            sector="Design",
            project_value=Decimal("8000.00"),
            portal_password_hash=make_password("portalpass123"),
        )
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.consultant)

    def _create_test_image(self, width=500, height=500, format="JPEG"):
        from io import BytesIO
        from PIL import Image
        from django.core.files.uploadedfile import SimpleUploadedFile

        buffer = BytesIO()
        img = Image.new("RGB", (width, height), color=(100, 150, 200))
        img.save(buffer, format=format)
        buffer.seek(0)
        ext = "jpg" if format == "JPEG" else format.lower()
        return SimpleUploadedFile(
            name=f"test_image.{ext}",
            content=buffer.getvalue(),
            content_type=f"image/{ext if ext != 'jpg' else 'jpeg'}",
        )

    @override_settings(DEBUG=True)
    def test_valid_moodboard_upload_succeeds(self):
        test_img = self._create_test_image()
        response = self.api_client.post(
            f"/api/projects/{self.project.id}/moodboards/",
            {"title": "Test Moodboard 1", "image": test_img},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)
        self.assertEqual(response.data["title"], "Test Moodboard 1")
        self.assertTrue(response.data["image_url"])
        self.assertNotIn("private.blob.vercel-storage.com", response.data["image_url"])

    def test_private_moodboard_upload_uses_access_private(self):
        from unittest.mock import patch, MagicMock

        test_img = self._create_test_image()
        mock_result = MagicMock()
        mock_result.pathname = f"moodboards/{self.project.id}/test_uuid.jpg"
        mock_result.url = f"https://hash.private.blob.vercel-storage.com/moodboards/{self.project.id}/test_uuid.jpg"

        with patch.object(settings, "DEBUG", False), patch.dict("os.environ", {"VERCEL": "1"}), patch("vercel.blob.BlobClient.put", return_value=mock_result) as mock_put:
            response = self.api_client.post(
                f"/api/projects/{self.project.id}/moodboards/",
                {"title": "Private Upload Test", "image": test_img},
                format="multipart",
            )
            self.assertEqual(response.status_code, 201)
            mock_put.assert_called_once()
            _, kwargs = mock_put.call_args
            self.assertEqual(kwargs.get("access"), "private")
            self.assertFalse(kwargs.get("add_random_suffix"))

    def test_no_raw_private_blob_url_in_api_responses(self):
        from .models import Moodboard
        from .serializers import MoodboardSerializer, ClientPortalMoodboardSerializer

        mb = Moodboard.objects.create(
            project=self.project,
            title="Private URL Check",
            image="moodboards/1/test_private.jpg",
        )
        serializer = MoodboardSerializer(mb)
        client_serializer = ClientPortalMoodboardSerializer(mb)

        self.assertNotIn("private.blob.vercel-storage.com", serializer.data["image_url"])
        self.assertIn(f"/api/projects/{self.project.id}/moodboards/{mb.id}/image/", serializer.data["image_url"])

        self.assertNotIn("private.blob.vercel-storage.com", client_serializer.data["image_url"])
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/moodboards/{mb.id}/image/", client_serializer.data["image_url"])

    @override_settings(DEBUG=True)
    def test_protected_consultant_retrieval(self):
        test_img = self._create_test_image()
        post_resp = self.api_client.post(
            f"/api/projects/{self.project.id}/moodboards/",
            {"title": "Consultant Download Test", "image": test_img},
            format="multipart",
        )
        self.assertEqual(post_resp.status_code, 201)
        mb_id = post_resp.data["id"]

        get_resp = self.api_client.get(f"/api/projects/{self.project.id}/moodboards/{mb_id}/image/")
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.headers.get("Cache-Control"), "private, no-store, max-age=0")

    @override_settings(DEBUG=True)
    def test_protected_client_portal_retrieval(self):
        test_img = self._create_test_image()
        post_resp = self.api_client.post(
            f"/api/projects/{self.project.id}/moodboards/",
            {"title": "Client Portal Download Test", "image": test_img},
            format="multipart",
        )
        mb_id = post_resp.data["id"]

        portal_client = APIClient()
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.project.portal_token)
        get_resp = portal_client.get(f"/api/client-portal/{self.project.portal_token}/moodboards/{mb_id}/image/")
        self.assertEqual(get_resp.status_code, 200)

    def test_unauthorized_retrieval_rejection(self):
        from .models import Moodboard

        mb = Moodboard.objects.create(
            project=self.project,
            title="Unauthorized Retrieval Test",
            image="moodboards/1/test_unauth.jpg",
        )
        self.api_client.force_authenticate(user=self.other_consultant)
        response = self.api_client.get(f"/api/projects/{self.project.id}/moodboards/{mb.id}/image/")
        self.assertEqual(response.status_code, 404)

        unauth_client = APIClient()
        response_portal = unauth_client.get(f"/api/client-portal/{self.project.portal_token}/moodboards/{mb.id}/image/")
        self.assertEqual(response_portal.status_code, 403)

    def test_blob_deletion(self):
        from unittest.mock import patch
        from .models import Moodboard

        mb = Moodboard.objects.create(
            project=self.project,
            title="Delete Test",
            image="moodboards/1/test_delete.jpg",
        )
        with patch("vercel.blob.BlobClient.delete") as mock_delete:
            response = self.api_client.delete(f"/api/projects/{self.project.id}/moodboards/{mb.id}/")
            self.assertEqual(response.status_code, 204)
            self.assertFalse(Moodboard.objects.filter(id=mb.id).exists())

    def test_storage_save_failure_returns_503(self):
        from unittest.mock import patch

        test_img = self._create_test_image()
        with patch("projects.serializers.MoodboardSerializer.save", side_effect=OSError("Blob SDK failure")):
            response = self.api_client.post(
                f"/api/projects/{self.project.id}/moodboards/",
                {"title": "Fail Storage", "image": test_img},
                format="multipart",
            )
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["detail"], "Image storage is temporarily unavailable.")

    def test_no_local_filesystem_writes_when_debug_false(self):
        from unittest.mock import patch, MagicMock

        test_img = self._create_test_image()
        mock_result = MagicMock()
        mock_result.pathname = f"moodboards/{self.project.id}/test_prod.jpg"

        with patch.object(settings, "DEBUG", False), patch.dict("os.environ", {"VERCEL": "1"}), patch("vercel.blob.BlobClient.put", return_value=mock_result), patch("django.core.files.storage.FileSystemStorage._save") as mock_local_save:
            response = self.api_client.post(
                f"/api/projects/{self.project.id}/moodboards/",
                {"title": "Prod Upload", "image": test_img},
                format="multipart",
            )
            self.assertEqual(response.status_code, 201)
            mock_local_save.assert_not_called()


class AllFileFieldsStorageAuditTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.hashers import make_password
        from .models import Project
        User = get_user_model()
        self.user = User.objects.create(
            email="audit_user@example.com",
            password=make_password("Pass123!"),
            user_type="consultant",
        )
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            consultant=self.user,
            client_name="Audit Client",
            client_email="audit_client@example.com",
            company_name="Audit Company",
            sector="Testing",
            project_value=Decimal("12000.00"),
        )

    @override_settings(DEBUG=True)
    def test_concept_serializers_and_protected_download_routes(self):
        from .models import Concept
        from .serializers import ConsultantConceptSerializer, ClientPortalConceptSerializer
        from django.core.files.uploadedfile import SimpleUploadedFile

        concept = Concept.objects.create(
            project=self.project,
            title="Concept 1",
            image=self._create_test_image(),
            file=SimpleUploadedFile("c_doc.pdf", b"fake_pdf_bytes", content_type="application/pdf"),
            status=Concept.Status.SHARED,
        )

        c_serializer = ConsultantConceptSerializer(concept)
        self.assertIn(f"/api/projects/{self.project.id}/concepts/{concept.id}/image/", c_serializer.data["image_url"])
        self.assertIn(f"/api/projects/{self.project.id}/concepts/{concept.id}/file/", c_serializer.data["file_url"])

        cp_serializer = ClientPortalConceptSerializer(concept)
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/concepts/{concept.id}/image/", cp_serializer.data["image_url"])
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/concepts/{concept.id}/file/", cp_serializer.data["file_url"])

        res_img = self.api_client.get(f"/api/projects/{self.project.id}/concepts/{concept.id}/image/")
        self.assertEqual(res_img.status_code, 200)
        self.assertEqual(res_img.headers.get("Cache-Control"), "private, no-store, max-age=0")

        res_file = self.api_client.get(f"/api/projects/{self.project.id}/concepts/{concept.id}/file/")
        self.assertEqual(res_file.status_code, 200)

        portal_client = APIClient()
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.project.portal_token)
        res_cp_img = portal_client.get(f"/api/client-portal/{self.project.portal_token}/concepts/{concept.id}/image/")
        self.assertEqual(res_cp_img.status_code, 200)

        res_cp_file = portal_client.get(f"/api/client-portal/{self.project.portal_token}/concepts/{concept.id}/file/")
        self.assertEqual(res_cp_file.status_code, 200)

    def _create_test_image(self):
        from PIL import Image
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        buf = BytesIO()
        Image.new("RGB", (20, 20), color="blue").save(buf, format="JPEG")
        return SimpleUploadedFile("test_audit.jpg", buf.getvalue(), content_type="image/jpeg")

    @override_settings(DEBUG=True)
    def test_deliverable_serializers_and_protected_download_routes(self):
        from .models import Deliverable
        from .serializers import ConsultantDeliverableSerializer, ClientPortalDeliverableSerializer
        from django.core.files.uploadedfile import SimpleUploadedFile

        deliverable = Deliverable.objects.create(
            project=self.project,
            title="Deliverable 1",
            file=SimpleUploadedFile("deliv.zip", b"fake_zip_bytes", content_type="application/zip"),
            status=Deliverable.Status.DELIVERED,
        )

        c_serializer = ConsultantDeliverableSerializer(deliverable)
        self.assertIn(f"/api/projects/{self.project.id}/deliverables/{deliverable.id}/file/", c_serializer.data["file_url"])

        cp_serializer = ClientPortalDeliverableSerializer(deliverable)
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/deliverables/{deliverable.id}/file/", cp_serializer.data["file_url"])

        res = self.api_client.get(f"/api/projects/{self.project.id}/deliverables/{deliverable.id}/file/")
        self.assertEqual(res.status_code, 200)

    @override_settings(DEBUG=True)
    def test_agreement_serializers_and_protected_download_routes(self):
        from .models import Agreement
        from .serializers import ConsultantAgreementSerializer, ClientPortalAgreementSerializer
        from django.core.files.uploadedfile import SimpleUploadedFile

        agreement = Agreement.objects.create(
            project=self.project,
            title="Agreement 1",
            file=SimpleUploadedFile("agreement.pdf", b"fake_pdf_bytes", content_type="application/pdf"),
        )

        c_serializer = ConsultantAgreementSerializer(agreement)
        self.assertIn(f"/api/projects/{self.project.id}/agreement/{agreement.id}/file/", c_serializer.data["file_url"])

        cp_serializer = ClientPortalAgreementSerializer(agreement)
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/agreement/file/", cp_serializer.data["file_url"])

        res = self.api_client.get(f"/api/projects/{self.project.id}/agreement/{agreement.id}/file/")
        self.assertEqual(res.status_code, 200)

    @override_settings(DEBUG=True)
    def test_project_agreement_pdf_urls_and_protected_routes(self):
        from .models import ProjectAgreement
        from .views import get_project_agreement_payload
        from django.core.files.uploadedfile import SimpleUploadedFile

        pa = ProjectAgreement.objects.create(
            project=self.project,
            basic_pdf_file=SimpleUploadedFile("basic.pdf", b"pdf_bytes", content_type="application/pdf"),
        )

        payload_consultant = get_project_agreement_payload(pa, is_client_portal=False)
        self.assertIn(f"/api/projects/{self.project.id}/generated-agreement/pdf/?type=basic", payload_consultant["basic_pdf_url"])

        payload_client = get_project_agreement_payload(pa, is_client_portal=True)
        self.assertIn(f"/api/client-portal/{self.project.portal_token}/agreement/pdf/?type=basic", payload_client["basic_pdf_url"])

    @override_settings(DEBUG=True)
    def test_concept_upload_with_spaces_and_special_characters_succeeds(self):
        from .models import Concept
        from django.core.files.uploadedfile import SimpleUploadedFile
        img = self._create_test_image()
        img.name = "MOON HOLIDAYS LOGO FINAL.png"
        pdf_file = SimpleUploadedFile(
            "Rwen Construction & Interiors Private Limited.pdf",
            b"%PDF-1.4 fake pdf content",
            content_type="application/pdf",
        )
        response = self.api_client.post(
            f"/api/projects/{self.project.id}/concepts/",
            {
                "title": "Concept With Spaces",
                "description": "Test description",
                "image": img,
                "file": pdf_file,
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("MOON_HOLIDAYS_LOGO_FINAL", response.data["image"])
        self.assertIn("Rwen_Construction", response.data["file"])


class ConceptUploadCleanupAndRegressionTests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        from django.contrib.auth.hashers import make_password
        User = get_user_model()
        self.user = User.objects.create(
            email="cleanup_user@example.com",
            password=make_password("Pass123!"),
            user_type="consultant",
        )
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)
        self.project = Project.objects.create(
            consultant=self.user,
            client_name="Cleanup Client",
            client_email="cleanup@example.com",
            company_name="Cleanup Co",
            sector="Testing",
            project_value=Decimal("15000.00"),
        )

    def _create_test_image(self, name="test_clean.jpg"):
        from PIL import Image
        buf = BytesIO()
        Image.new("RGB", (20, 20), color="red").save(buf, format="JPEG")
        return SimpleUploadedFile(name, buf.getvalue(), content_type="image/jpeg")

    @override_settings(DEBUG=True)
    def test_concept_upload_returns_protected_urls_without_raw_blob_urls(self):
        img = self._create_test_image("prod_test.jpg")
        pdf = SimpleUploadedFile("doc.pdf", b"%PDF-1.4 content", content_type="application/pdf")
        response = self.api_client.post(
            f"/api/projects/{self.project.id}/concepts/",
            {"title": "Prod Concept", "image": img, "file": pdf},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201)
        concept_id = response.data["id"]
        self.assertIn(f"/api/projects/{self.project.id}/concepts/{concept_id}/image/", response.data["image_url"])
        self.assertIn(f"/api/projects/{self.project.id}/concepts/{concept_id}/file/", response.data["file_url"])
        self.assertNotIn("blob.vercel-storage.com", response.data["image_url"])
        self.assertNotIn("blob.vercel-storage.com", response.data["file_url"])

    def test_cleanup_when_file_upload_fails_after_image_upload(self):
        from unittest.mock import patch
        from .models import Concept
        img = self._create_test_image("clean_img.jpg")
        pdf = SimpleUploadedFile("clean_doc.pdf", b"%PDF-1.4 bad", content_type="application/pdf")

        initial_count = Concept.objects.filter(project=self.project).count()
        deleted_files = []

        def mock_delete(name):
            deleted_files.append(name)

        with patch("django.core.files.storage.FileSystemStorage.delete", side_effect=mock_delete):
            with patch("projects.upload_validation.validate_upload_file", side_effect=[None, serializers.ValidationError("PDF corrupt")]):
                response = self.api_client.post(
                    f"/api/projects/{self.project.id}/concepts/",
                    {"title": "Failed Concept", "image": img, "file": pdf},
                    format="multipart",
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(Concept.objects.filter(project=self.project).count(), initial_count)

    def test_cleanup_and_rollback_when_db_save_fails(self):
        from unittest.mock import patch
        from .models import Concept
        img = self._create_test_image("fail_db.jpg")
        pdf = SimpleUploadedFile("fail_db.pdf", b"%PDF-1.4 fail", content_type="application/pdf")

        initial_count = Concept.objects.filter(project=self.project).count()
        deleted_files = []

        def mock_delete(name):
            deleted_files.append(name)

        with patch("django.core.files.storage.default_storage.delete", side_effect=mock_delete):
            with patch("projects.models.Concept.objects.create", side_effect=Exception("DB Error")):
                response = self.api_client.post(
                    f"/api/projects/{self.project.id}/concepts/",
                    {"title": "DB Fail Concept", "image": img, "file": pdf},
                    format="multipart",
                )
                self.assertEqual(response.status_code, 500)
                self.assertEqual(Concept.objects.filter(project=self.project).count(), initial_count)

    def test_cleanup_and_rollback_when_response_serialization_fails(self):
        from unittest.mock import patch
        from .models import Concept
        img = self._create_test_image("ser_fail.jpg")
        pdf = SimpleUploadedFile("ser_fail.pdf", b"%PDF-1.4 ser", content_type="application/pdf")

        initial_count = Concept.objects.filter(project=self.project).count()
        deleted_files = []

        def mock_delete(name):
            deleted_files.append(name)

        with patch("django.core.files.storage.default_storage.delete", side_effect=mock_delete):
            with patch("projects.serializers.ConsultantConceptSerializer.to_representation", side_effect=Exception("Serialization Error")):
                response = self.api_client.post(
                    f"/api/projects/{self.project.id}/concepts/",
                    {"title": "Ser Fail Concept", "image": img, "file": pdf},
                    format="multipart",
                )
                self.assertEqual(response.status_code, 500)
                self.assertEqual(Concept.objects.filter(project=self.project).count(), initial_count)
