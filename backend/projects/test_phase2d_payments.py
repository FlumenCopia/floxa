import hmac
import hashlib
import json
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import (
    Client,
    Project,
    PaymentMilestone,
    PaymentTransaction,
    RazorpayWebhookEvent,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    RazorpaySignatureVerificationError,
    sign_portal_access_token,
)

User = get_user_model()


@override_settings(
    RAZORPAY_KEY_ID="rzp_test_mock_key",
    RAZORPAY_KEY_SECRET="mock_secret_key_123",
    RAZORPAY_WEBHOOK_SECRET="mock_webhook_secret_abc",
)
class Phase2DPaymentsValidationTests(TestCase):
    """
    Dedicated test suite for Phase 2D:
    Verifies payment creation, milestone state transitions, Razorpay signature checks,
    cross-project isolation, and webhook idempotency.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant = User.objects.create_user(
            email="consultant_payments@floxa.test",
            name="Alice PaymentsConsultant",
            password="StrongPassword123!",
        )
        self.other_consultant = User.objects.create_user(
            email="other_payments@floxa.test",
            name="Bob PaymentsConsultant",
            password="StrongPassword123!",
        )

        # Create Project A
        self.client_record = Client.objects.create(
            name="Pay Client",
            email="client@pay.test",
            company_name="Pay Corp",
            sector="Finance",
        )
        self.project_a = Project.objects.create(
            consultant=self.consultant,
            client=self.client_record,
            title="Pay Project A",
            company_name="Pay Corp",
            sector="Finance",
            project_value=Decimal("100000.00"),
            portal_token=uuid.uuid4(),
            status=Project.Status.CREATED,
        )

        # Create Milestones for Project A
        self.milestone_adv = PaymentMilestone.objects.create(
            project=self.project_a,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=50,
            status=PaymentMilestone.Status.REQUESTED,  # Eligible for payment
        )
        self.milestone_mid = PaymentMilestone.objects.create(
            project=self.project_a,
            type=PaymentMilestone.Type.MID,
            percentage=25,
            status=PaymentMilestone.Status.LOCKED,  # Locked
        )
        self.milestone_final = PaymentMilestone.objects.create(
            project=self.project_a,
            type=PaymentMilestone.Type.FINAL,
            percentage=25,
            status=PaymentMilestone.Status.PAID,  # Already paid
        )

        # Create Project B (for isolation tests)
        self.project_b = Project.objects.create(
            consultant=self.other_consultant,
            client=self.client_record,
            title="Pay Project B",
            company_name="Pay Corp B",
            sector="Finance",
            project_value=Decimal("80000.00"),
            portal_token=uuid.uuid4(),
            status=Project.Status.CREATED,
        )
        self.milestone_b = PaymentMilestone.objects.create(
            project=self.project_b,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=50,
            status=PaymentMilestone.Status.REQUESTED,
        )

    def get_authenticated_client_portal(self, project=None):
        proj = project or self.project_a
        portal_client = APIClient()
        cookie_val = sign_portal_access_token(proj.portal_token)
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val
        portal_client.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=str(proj.portal_token))
        return portal_client

    def test_01_order_create_for_requested_milestone_succeeds(self):
        """Verify order creation succeeds for requested milestone with authoritative backend amount."""
        portal_client = self.get_authenticated_client_portal()

        with patch("projects.views.create_razorpay_order") as mock_create:
            mock_create.return_value = {
                "id": "order_test_123",
                "amount": 5000000,
                "currency": "INR",
                "receipt": f"floxa-{self.milestone_adv.id}-test",
                "status": "created",
            }
            res = portal_client.post(
                reverse(
                    "client-portal-payment-create-order",
                    kwargs={"portal_token": self.project_a.portal_token, "milestone_id": self.milestone_adv.id},
                ),
            )
            self.assertEqual(res.status_code, 201)
            self.assertEqual(res.data["razorpay_order_id"], "order_test_123")
            self.assertEqual(res.data["amount"], 5000000)

            # Verify local transaction record
            tx = PaymentTransaction.objects.get(razorpay_order_id="order_test_123")
            self.assertEqual(tx.amount, Decimal("50000.00"))
            self.assertEqual(tx.status, PaymentTransaction.Status.CREATED)

    def test_02_order_create_rejected_for_locked_or_paid_milestone(self):
        """Verify order creation is blocked for locked or already paid milestones."""
        portal_client = self.get_authenticated_client_portal()

        # Attempt to pay LOCKED mid milestone
        locked_res = portal_client.post(
            reverse(
                "client-portal-payment-create-order",
                kwargs={"portal_token": self.project_a.portal_token, "milestone_id": self.milestone_mid.id},
            ),
        )
        self.assertEqual(locked_res.status_code, 400)
        self.assertIn("Only requested payment milestones can be paid", str(locked_res.data))

        # Attempt to pay PAID final milestone
        paid_res = portal_client.post(
            reverse(
                "client-portal-payment-create-order",
                kwargs={"portal_token": self.project_a.portal_token, "milestone_id": self.milestone_final.id},
            ),
        )
        self.assertEqual(paid_res.status_code, 400)
        self.assertIn("already paid", str(paid_res.data))

    def test_03_payment_verify_with_valid_signature_marks_milestone_paid(self):
        """Verify payment verification sets milestone status to PAID."""
        portal_client = self.get_authenticated_client_portal()

        # Create transaction first
        tx = PaymentTransaction.objects.create(
            project=self.project_a,
            milestone=self.milestone_adv,
            razorpay_order_id="order_verify_valid_456",
            amount=Decimal("50000.00"),
            currency="INR",
            status=PaymentTransaction.Status.CREATED,
        )

        with patch("projects.views.verify_razorpay_payment_signature") as mock_verify_sig, \
             patch("projects.views.fetch_razorpay_payment") as mock_fetch_pay:
            mock_verify_sig.return_value = True
            mock_fetch_pay.return_value = {
                "id": "pay_valid_456",
                "status": "captured",
                "order_id": "order_verify_valid_456",
                "amount": 5000000,
                "currency": "INR",
            }

            verify_res = portal_client.post(
                reverse("client-portal-payment-verify", kwargs={"portal_token": self.project_a.portal_token}),
                {
                    "milestone_id": self.milestone_adv.id,
                    "razorpay_order_id": "order_verify_valid_456",
                    "razorpay_payment_id": "pay_valid_456",
                    "razorpay_signature": "valid_mock_signature",
                },
                format="json",
            )
            self.assertEqual(verify_res.status_code, 200)

            # Confirm milestone and transaction are PAID/VERIFIED
            self.milestone_adv.refresh_from_db()
            self.assertEqual(self.milestone_adv.status, PaymentMilestone.Status.PAID)
            tx.refresh_from_db()
            self.assertEqual(tx.status, PaymentTransaction.Status.VERIFIED)

    def test_04_payment_verify_rejects_forged_signature_or_amount_mismatch(self):
        """Verify payment verification fails when signature is invalid or provider amount differs."""
        portal_client = self.get_authenticated_client_portal()

        PaymentTransaction.objects.create(
            project=self.project_a,
            milestone=self.milestone_adv,
            razorpay_order_id="order_tampered_789",
            amount=Decimal("50000.00"),
            currency="INR",
            status=PaymentTransaction.Status.CREATED,
        )

        # 1. Invalid signature
        with patch("projects.views.verify_razorpay_payment_signature") as mock_verify_sig:
            mock_verify_sig.side_effect = RazorpaySignatureVerificationError("Signature verification failed")
            bad_sig_res = portal_client.post(
                reverse("client-portal-payment-verify", kwargs={"portal_token": self.project_a.portal_token}),
                {
                    "milestone_id": self.milestone_adv.id,
                    "razorpay_order_id": "order_tampered_789",
                    "razorpay_payment_id": "pay_fake_789",
                    "razorpay_signature": "forged_signature",
                },
                format="json",
            )
            self.assertEqual(bad_sig_res.status_code, 400)

        # 2. Amount mismatch (provider captured 100 paise instead of 5,000,000 paise)
        with patch("projects.views.verify_razorpay_payment_signature") as mock_verify_sig, \
             patch("projects.views.fetch_razorpay_payment") as mock_fetch_pay:
            mock_verify_sig.return_value = True
            mock_fetch_pay.return_value = {
                "id": "pay_tampered_amount",
                "status": "captured",
                "order_id": "order_tampered_789",
                "amount": 100,  # ₹1 instead of ₹50,000
                "currency": "INR",
            }
            mismatch_res = portal_client.post(
                reverse("client-portal-payment-verify", kwargs={"portal_token": self.project_a.portal_token}),
                {
                    "milestone_id": self.milestone_adv.id,
                    "razorpay_order_id": "order_tampered_789",
                    "razorpay_payment_id": "pay_tampered_amount",
                    "razorpay_signature": "valid_sig",
                },
                format="json",
            )
            self.assertEqual(mismatch_res.status_code, 400)

    def test_05_cross_project_payment_isolation_returns_404(self):
        """Verify Client of Project A cannot pay for Project B milestone."""
        portal_client_a = self.get_authenticated_client_portal(project=self.project_a)

        # Attempt to create order for Project B milestone
        cross_res = portal_client_a.post(
            reverse(
                "client-portal-payment-create-order",
                kwargs={"portal_token": self.project_a.portal_token, "milestone_id": self.milestone_b.id},
            ),
        )
        self.assertEqual(cross_res.status_code, 404)

    def test_06_webhook_processing_and_idempotent_deduplication(self):
        """Verify asynchronous payment webhook processes event and ignores duplicate replays."""
        tx = PaymentTransaction.objects.create(
            project=self.project_a,
            milestone=self.milestone_adv,
            razorpay_order_id="order_webhook_101",
            amount=Decimal("50000.00"),
            currency="INR",
            status=PaymentTransaction.Status.CREATED,
        )

        webhook_payload = {
            "event": "payment.captured",
            "payload": {
                "payment": {
                    "entity": {
                        "id": "pay_wh_101",
                        "order_id": "order_webhook_101",
                        "amount": 5000000,
                        "currency": "INR",
                        "status": "captured",
                    }
                }
            }
        }
        body_bytes = json.dumps(webhook_payload).encode("utf-8")
        signature = hmac.new(
            b"mock_webhook_secret_abc",
            body_bytes,
            hashlib.sha256,
        ).hexdigest()

        # Send webhook for the first time
        anon_client = APIClient()
        wh_res = anon_client.post(
            reverse("razorpay-payment-webhook"),
            data=body_bytes,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
            HTTP_X_RAZORPAY_EVENT_ID="evt_wh_unique_101",
        )
        self.assertEqual(wh_res.status_code, 200)

        # Verify milestone is now PAID
        self.milestone_adv.refresh_from_db()
        self.assertEqual(self.milestone_adv.status, PaymentMilestone.Status.PAID)
        self.assertEqual(RazorpayWebhookEvent.objects.count(), 1)

        # Replay the identical webhook (same event ID)
        replay_res = anon_client.post(
            reverse("razorpay-payment-webhook"),
            data=body_bytes,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=signature,
            HTTP_X_RAZORPAY_EVENT_ID="evt_wh_unique_101",
        )
        self.assertEqual(replay_res.status_code, 200)
        self.assertIn("already handled", str(replay_res.data).lower())
        self.assertEqual(RazorpayWebhookEvent.objects.count(), 1)  # No duplicate record created
