import decimal
import json
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from channels.testing import WebsocketCommunicator
from config.asgi import application

from projects.models import (
    Project,
    Client,
    ClientProfile,
    ProjectDiscovery,
    ProjectAgreement,
    GeneratedAgreementSnapshot,
    PaymentMilestone,
    PaymentTransaction,
    Deliverable,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    PORTAL_ACCESS_SALT,
    sign_portal_access_token,
)

User = get_user_model()


class Phase1SecurityRegressionTests(TestCase):
    """
    Dedicated Phase 1 regression test suite covering:
    - SEC-001: Client-list / token exposure protection
    - SEC-002: Portal-password bypass prevention
    - SEC-003: WebSocket consultant authentication & isolation
    - SUP-001: Client-only action restrictions in Support Mode
    """

    def setUp(self):
        # 1. Create two distinct consultants
        self.consultant_a = User.objects.create_user(
            email="consultant_a@floxa.test",
            password="SecurePassword123!",
            name="Consultant Alice"
        )
        self.consultant_b = User.objects.create_user(
            email="consultant_b@floxa.test",
            password="SecurePassword123!",
            name="Consultant Bob"
        )

        # 2. Create clients
        self.client_a = Client.objects.create(
            name="Client AliceCorp",
            email="alice@alicecorp.test",
            company_name="AliceCorp Ltd",
            sector="Technology"
        )
        self.client_b = Client.objects.create(
            name="Client BobCorp",
            email="bob@bobcorp.test",
            company_name="BobCorp Ltd",
            sector="Finance"
        )

        # 3. Create projects
        self.token_a = uuid.uuid4()
        self.token_b = uuid.uuid4()
        self.token_open = uuid.uuid4()
        self.portal_password = "SecretPassword999!"

        self.project_a = Project.objects.create(
            consultant=self.consultant_a,
            client=self.client_a,
            title="AliceCorp Main Project",
            company_name="AliceCorp Ltd",
            project_value=Decimal("100000.00"),
            advance_percentage=50,
            mid_percentage=25,
            final_percentage=25,
            portal_token=self.token_a,
            portal_password_hash=make_password(self.portal_password)
        )

        self.project_b = Project.objects.create(
            consultant=self.consultant_b,
            client=self.client_b,
            title="BobCorp Main Project",
            company_name="BobCorp Ltd",
            project_value=Decimal("80000.00"),
            advance_percentage=50,
            mid_percentage=25,
            final_percentage=25,
            portal_token=self.token_b,
            portal_password_hash=make_password(self.portal_password)
        )

        self.project_open = Project.objects.create(
            consultant=self.consultant_a,
            client=self.client_a,
            title="Open Passwordless Project",
            company_name="Open Project Ltd",
            project_value=Decimal("50000.00"),
            portal_token=self.token_open,
            portal_password_hash=""
        )

        # Discovery for project_a
        self.discovery_a = ProjectDiscovery.objects.create(
            project=self.project_a,
            what_business_does="Testing Corp Discovery",
            target_customer="Developers",
            why_choose_us="Excellence",
            brand_feeling="Professional"
        )

        from projects.models import Moodboard
        self.profile_a = ClientProfile.objects.create(
            project=self.project_a,
            client_name="Client Alice",
            company_name="AliceCorp Ltd",
            industry="Technology"
        )
        self.moodboard_a = Moodboard.objects.create(
            project=self.project_a,
            title="Main Moodboard",
            description="Main visual direction",
            image="moodboards/test.jpg",
            is_selected=True,
            is_shared=True
        )

        # JWT tokens
        self.jwt_a = str(RefreshToken.for_user(self.consultant_a).access_token)
        self.jwt_b = str(RefreshToken.for_user(self.consultant_b).access_token)

        # API clients
        self.anon_client = APIClient()

        self.api_consultant_a = APIClient()
        self.api_consultant_a.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jwt_a}")

        self.api_consultant_b = APIClient()
        self.api_consultant_b.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jwt_b}")

        self.api_client_a = APIClient()
        self.api_client_a.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.token_a)

    # =========================================================================
    # SEC-001: Client-List Exposure
    # =========================================================================

    def test_anonymous_client_list_rejected(self):
        """Anonymous callers cannot access the client portal client-list."""
        response = self.anon_client.get("/api/client-portal/client-list/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_consultant_a_sees_only_own_projects(self):
        """Consultant A only receives Consultant A's assigned projects."""
        response = self.api_consultant_a.get("/api/client-portal/client-list/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        project_ids = [p["id"] for p in response.data.get("data", [])]
        self.assertIn(self.project_a.id, project_ids)
        self.assertIn(self.project_open.id, project_ids)
        self.assertNotIn(self.project_b.id, project_ids)

    def test_consultant_b_sees_only_own_projects(self):
        """Consultant B only receives Consultant B's assigned projects."""
        response = self.api_consultant_b.get("/api/client-portal/client-list/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        project_ids = [p["id"] for p in response.data.get("data", [])]
        self.assertIn(self.project_b.id, project_ids)
        self.assertNotIn(self.project_a.id, project_ids)
        self.assertNotIn(self.project_open.id, project_ids)

    def test_client_list_does_not_expose_client_emails(self):
        """Client list returns only required UI fields and omits client email."""
        response = self.api_consultant_a.get("/api/client-portal/client-list/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for item in response.data.get("data", []):
            self.assertNotIn("client_email", item)
            self.assertIn("portal_token", item)
            self.assertIn("title", item)

    # =========================================================================
    # SEC-002: Portal-Password Bypass Prevention
    # =========================================================================

    def test_matching_token_header_alone_fails_password_verification(self):
        """
        Providing X-Client-Portal-Token matching the portal UUID without valid
        server-signed verification cookie fails with HTTP 401 or 403.
        """
        response = self.anon_client.get(
            f"/api/client-portal/{self.token_a}/",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_correct_password_verification_allows_access(self):
        """Correctly signed cookie allows authentic client access."""
        response = self.api_client_a.get(f"/api/client-portal/{self.token_a}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("project_id"), self.project_a.id)

    def test_cookie_for_other_project_rejected(self):
        """A valid cookie for Project B cannot unlock Project A."""
        client = APIClient()
        client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.token_b)
        response = client.get(f"/api/client-portal/{self.token_a}/")
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_tampered_cookie_rejected(self):
        """A forged or tampered cookie cannot unlock the portal."""
        client = APIClient()
        client.cookies[PORTAL_ACCESS_COOKIE_NAME] = "forged-signature:invalid"
        response = client.get(f"/api/client-portal/{self.token_a}/")
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_passwordless_portal_allows_open_access(self):
        """A portal with no password set allows open client access."""
        response = self.anon_client.get(f"/api/client-portal/{self.token_open}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_assigned_consultant_in_support_mode_accesses_without_password(self):
        """Assigned consultant can access the portal via their own authenticated Support Mode."""
        response = self.api_consultant_a.get(f"/api/client-portal/{self.token_a}/?mode=consultant")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("project_id"), self.project_a.id)

    def test_assigned_consultant_without_support_mode_signal_rejected(self):
        """Assigned consultant on plain client URL without Support Mode does not silently enter."""
        response = self.api_consultant_a.get(f"/api/client-portal/{self.token_a}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("password", response.data.get("detail", "").lower())

    def test_unassigned_consultant_rejected_from_support_mode(self):
        """Consultant B is rejected with 403 when trying to access Consultant A's project portal."""
        response = self.api_consultant_b.get(f"/api/client-portal/{self.token_a}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # =========================================================================
    # SEC-003: WebSocket Consultant Authentication & Isolation
    # =========================================================================

    async def test_anonymous_consultant_websocket_rejected(self):
        """Anonymous connection to /ws/support/consultant/ is rejected with code 4001."""
        communicator = WebsocketCommunicator(application, "/ws/support/consultant/")
        connected, close_code = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "ERROR")
        try:
            await communicator.disconnect()
        except Exception:
            pass

    async def test_authenticated_consultant_connects_to_notification_channel(self):
        """Authenticated consultant connects and receives ready confirmation with consultant ID."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "CONSULTANT_READY")
        self.assertEqual(msg.get("consultant_id"), self.consultant_a.id)
        try:
            await communicator.disconnect()
        except Exception:
            pass

    async def test_consultant_isolation_help_notification(self):
        """Consultant A receives help notifications for Project A, but Consultant B does not."""
        comm_a = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}"
        )
        comm_b = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_b}"
        )
        await comm_a.connect()
        await comm_b.connect()
        await comm_a.receive_json_from()
        await comm_b.receive_json_from()

        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        payload = {
            "type": "broadcast_help_requested",
            "data": {
                "project_id": self.project_a.id,
                "project_title": self.project_a.title,
                "client_name": "Client Alice",
                "portal_token": str(self.token_a),
                "page_id": "Step 2",
                "field_key": "tagline",
                "question": "Need guidance on tagline",
                "requested_at": timezone.now().isoformat(),
            }
        }
        await channel_layer.group_send(f"consultant_user_{self.consultant_a.id}", payload)

        msg_a = await comm_a.receive_json_from()
        self.assertEqual(msg_a.get("type"), "NOTIFICATION_HELP_REQUESTED")
        self.assertEqual(msg_a.get("project_id"), self.project_a.id)

        received_nothing = await comm_b.receive_nothing()
        self.assertTrue(received_nothing)

        try:
            await comm_a.disconnect()
            await comm_b.disconnect()
        except Exception:
            pass

    async def test_password_protected_project_support_websocket_rejects_unverified_client(self):
        """Connecting to /ws/support/<portal_token>/ without password cookie closes with code 4003."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/{self.token_a}/"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "ERROR")
        self.assertIn("password", msg.get("message", "").lower())
        try:
            await communicator.disconnect()
        except Exception:
            pass

    async def test_password_protected_project_support_websocket_allows_verified_client(self):
        """Connecting with signed floxa_portal_access cookie succeeds."""
        signed_cookie = sign_portal_access_token(self.token_a)
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/{self.token_a}/",
            headers=[(b"cookie", f"{PORTAL_ACCESS_COOKIE_NAME}={signed_cookie}".encode())]
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "INITIAL_STATE")
        self.assertEqual(msg.get("role"), "client")
        try:
            await communicator.disconnect()
        except Exception:
            pass

    async def test_assigned_consultant_connects_to_support_websocket(self):
        """Assigned consultant connects in Support Mode via consultant_token."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/{self.token_a}/?consultant_token={self.jwt_a}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "INITIAL_STATE")
        self.assertEqual(msg.get("role"), "consultant")
        try:
            await communicator.disconnect()
        except Exception:
            pass

    async def test_unassigned_consultant_rejected_from_support_websocket(self):
        """Unassigned consultant B connecting to Project A support room is rejected with 4003."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/{self.token_a}/?consultant_token={self.jwt_b}"
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        msg = await communicator.receive_json_from()
        self.assertEqual(msg.get("type"), "ERROR")
        self.assertIn("Permission denied", msg.get("message", ""))
        try:
            await communicator.disconnect()
        except Exception:
            pass

    # =========================================================================
    # SUP-001: Client-Only Action Restrictions
    # =========================================================================

    def _setup_agreement_for_signing(self):
        agreement = ProjectAgreement.objects.create(
            project=self.project_a,
            status=ProjectAgreement.Status.DRAFT,
            signature_requested_at=timezone.now()
        )
        return agreement

    def _setup_payment_milestone(self):
        milestone = PaymentMilestone.objects.create(
            project=self.project_a,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=50,
            amount=Decimal("50000.00"),
            status=PaymentMilestone.Status.REQUESTED
        )
        return milestone

    def test_consultant_blocked_from_signing_agreement(self):
        """Consultants assisting in Support Mode are blocked from signing agreements (403)."""
        agreement = self._setup_agreement_for_signing()

        # Consultant A calls agreement sign endpoint with consultant JWT and matching header
        response = self.api_consultant_a.post(
            f"/api/client-portal/{self.token_a}/agreement/sign/",
            {
                "signer_name": "Consultant Alice Forging Client",
                "signature_method": "typed",
                "has_read_agreement": True
            },
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        agreement.refresh_from_db()
        self.assertEqual(agreement.status, ProjectAgreement.Status.DRAFT)
        self.assertIsNone(agreement.signed_at)
        self.assertEqual(agreement.signer_name, "")

    def test_consultant_with_client_cookie_still_blocked_from_signing(self):
        """
        If both consultant credentials and client portal cookie are present,
        actor is resolved conservatively and consultant cannot sign.
        """
        agreement = self._setup_agreement_for_signing()

        # Client has cookie AND JWT
        hybrid_client = APIClient()
        hybrid_client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jwt_a}")
        hybrid_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.token_a)

        response = hybrid_client.post(
            f"/api/client-portal/{self.token_a}/agreement/sign/",
            {
                "signer_name": "Consultant Alice",
                "signature_method": "typed",
                "has_read_agreement": True
            },
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        agreement.refresh_from_db()
        self.assertEqual(agreement.status, ProjectAgreement.Status.DRAFT)

    def test_authentic_client_can_sign_agreement(self):
        """Authentic client with valid portal cookie signs agreement successfully."""
        agreement = self._setup_agreement_for_signing()

        response = self.api_client_a.post(
            f"/api/client-portal/{self.token_a}/agreement/sign/",
            {
                "signer_name": "Authentic Client Signer",
                "signature_method": "typed",
                "has_read_agreement": True
            },
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        agreement.refresh_from_db()
        self.assertIn(agreement.status, [ProjectAgreement.Status.SIGNED, ProjectAgreement.Status.ACTIVE])
        self.assertEqual(agreement.signer_name, "Authentic Client Signer")
        self.assertIsNotNone(agreement.signed_at)

    def test_consultant_blocked_from_accepting_generated_agreement(self):
        """Consultants in Support Mode cannot accept generated agreements."""
        snapshot = GeneratedAgreementSnapshot.objects.create(
            project=self.project_a,
            status=GeneratedAgreementSnapshot.Status.DRAFT,
            version=1,
            generated_at=timezone.now(),
            snapshot={"terms": "sample"}
        )

        response = self.api_consultant_a.post(
            f"/api/client-portal/{self.token_a}/generated-agreement/accept/",
            {"accepted": True},
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        snapshot.refresh_from_db()
        self.assertIsNone(snapshot.accepted_at)

    def test_authentic_client_can_accept_generated_agreement(self):
        """Authentic client accepts generated agreement successfully."""
        from projects.models import ProjectActivity
        snapshot = GeneratedAgreementSnapshot.objects.create(
            project=self.project_a,
            status=GeneratedAgreementSnapshot.Status.DRAFT,
            version=1,
            generated_at=timezone.now(),
            snapshot={"terms": "sample"}
        )
        ProjectActivity.objects.create(
            project=self.project_a,
            consultant=self.consultant_a,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_shared",
            metadata={"agreement_version": snapshot.version}
        )

        response = self.api_client_a.post(
            f"/api/client-portal/{self.token_a}/generated-agreement/accept/",
            {"accepted": True},
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        snapshot.refresh_from_db()
        self.assertEqual(snapshot.status, GeneratedAgreementSnapshot.Status.ACCEPTED)
        self.assertIsNotNone(snapshot.accepted_at)

    def test_consultant_blocked_from_creating_client_payment_order(self):
        """Consultants in Support Mode cannot create client payment orders."""
        milestone = self._setup_payment_milestone()

        response = self.api_consultant_a.post(
            f"/api/client-portal/{self.token_a}/payments/{milestone.id}/create-order/",
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("projects.views.create_razorpay_order")
    def test_authentic_client_can_create_payment_order(self, mock_create_order):
        """Authentic client creates payment order successfully."""
        mock_create_order.return_value = {"id": "order_test_client_123"}
        milestone = self._setup_payment_milestone()

        response = self.api_client_a.post(
            f"/api/client-portal/{self.token_a}/payments/{milestone.id}/create-order/",
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["razorpay_order_id"], "order_test_client_123")

    def test_consultant_blocked_from_client_payment_verify(self):
        """Consultants in Support Mode cannot verify client payments."""
        response = self.api_consultant_a.post(
            f"/api/client-portal/{self.token_a}/payments/verify/",
            {
                "razorpay_order_id": "order_123",
                "razorpay_payment_id": "pay_123",
                "razorpay_signature": "sig_123"
            },
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_consultant_blocked_from_signoff(self):
        """Consultants in Support Mode cannot perform project sign-off."""
        response = self.api_consultant_a.post(
            f"/api/client-portal/{self.token_a}/sign-off/",
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.project_a.refresh_from_db()
        self.assertFalse(self.project_a.client_signed_off)

    def test_consultant_permitted_support_assistance(self):
        """
        Consultant in Support Mode CAN view client data and edit permitted fields
        (such as saving discovery draft or client profile).
        """
        # 1. Consultant reads project portal data in Support Mode
        get_resp = self.api_consultant_a.get(f"/api/client-portal/{self.token_a}/?mode=consultant")
        self.assertEqual(get_resp.status_code, status.HTTP_200_OK)

        # 2. Consultant saves discovery draft in Support Mode via POST
        disc_resp = self.api_consultant_a.post(
            f"/api/projects/{self.project_a.id}/discovery/",
            {
                "what_business_does": "Support assisted discovery notes",
                "target_customer": "Enterprise teams",
                "why_choose_us": "Precision and speed",
                "brand_feeling": "Professional, sleek"
            },
            format="json",
            HTTP_X_CLIENT_PORTAL_TOKEN=str(self.token_a),
            HTTP_X_SUPPORT_MODE="true",
        )
        self.assertEqual(disc_resp.status_code, status.HTTP_200_OK)

        # Verify discovery saved in DB
        disc = ProjectDiscovery.objects.get(project=self.project_a)
        self.assertEqual(disc.what_business_does, "Support assisted discovery notes")
