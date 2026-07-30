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

from .models import Client, Concept, PaymentMilestone, PaymentTransaction, Project, ProjectAgreement, RazorpayWebhookEvent
from .progress import calculate_project_progress
from .views import (
    PORTAL_ACCESS_COOKIE_NAME,
    PaymentCompletionError,
    PROJECT_ASSISTANT_PROMPT_MAX_LENGTH,
    _build_project_assistant_prompt,
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

        self.assertEqual(calculate_project_progress(self.project), 75)

    def test_signature_requested_project_agreement_does_not_award_agreement_progress(self):
        ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.SIGNATURE_REQUESTED,
        )

        self.assertEqual(calculate_project_progress(self.project), 75)

    def test_signed_project_agreement_awards_agreement_progress(self):
        ProjectAgreement.objects.create(
            project=self.project,
            status=ProjectAgreement.Status.SIGNED,
            signed_at=timezone.now(),
        )

        self.assertEqual(calculate_project_progress(self.project), 82)

    def test_final_signoff_still_reaches_complete_progress(self):
        self.project.client_signed_off = True
        self.project.save(update_fields=["client_signed_off", "updated_at"])

        self.assertEqual(calculate_project_progress(self.project), 100)


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
            {"message": "Hello"},
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
            {"message": "Hello"},
            format="json",
        )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["detail"], "Gemini API rate limit or quota was reached.")

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

        self.assertLessEqual(len(prompt), PROJECT_ASSISTANT_PROMPT_MAX_LENGTH)
        self.assertIn("workflow", prompt)
        self.assertIn("recommend one clear next action", prompt)
        self.assertIn("payments", prompt)
        self.assertNotIn("sources_available", prompt)

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
