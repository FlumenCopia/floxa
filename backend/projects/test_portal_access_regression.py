import uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core import signing
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from projects.models import (
    Agreement,
    Client,
    ClientProfile,
    PaymentMilestone,
    Project,
    ProjectAgreement,
    ProjectDiscovery,
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    PORTAL_ACCESS_SALT,
    sign_portal_access_token,
)

User = get_user_model()


@override_settings(DEBUG=True)
class ClientPortalAccessRegressionTests(TestCase):
    def setUp(self):
        # Consultant A (assigned)
        self.consultant_a = User.objects.create_user(
            email="consultant_a_reg@example.com",
            password="password123",
            name="Consultant A",
        )
        # Consultant B (unassigned)
        self.consultant_b = User.objects.create_user(
            email="consultant_b_reg@example.com",
            password="password123",
            name="Consultant B",
        )
        # Staff user
        self.staff_user = User.objects.create_user(
            email="staff_reg@example.com",
            password="password123",
            name="Staff User",
            is_staff=True,
        )

        # Clients
        self.client_a = Client.objects.create(
            name="Client Alpha",
            email="alpha_reg@example.com",
            company_name="Alpha Corp",
        )
        self.client_b = Client.objects.create(
            name="Client Beta",
            email="beta_reg@example.com",
            company_name="Beta Corp",
        )

        # Project A (assigned to Consultant A, password protected)
        self.project_a = Project.objects.create(
            title="Project Alpha",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Alpha Corp",
            sector="Finance",
            project_value=Decimal("5000.00"),
            portal_password_hash=make_password("correct-pass-123"),
            portal_token=uuid.uuid4(),
        )
        self.profile_a = ClientProfile.objects.create(
            project=self.project_a,
            client_name="Client Alpha",
            company_name="Alpha Corp",
            email="alpha_reg@example.com",
        )
        self.discovery_a = ProjectDiscovery.objects.create(
            project=self.project_a,
            what_business_does="Alpha Corp Description",
            target_customer="Enterprise",
            why_choose_us="Best in class",
            brand_feeling="Professional",
            audience_archetype="The Creator",
        )
        self.agreement_a = ProjectAgreement.objects.create(
            project=self.project_a,
            status="draft",
        )
        self.milestone_a = PaymentMilestone.objects.create(
            project=self.project_a,
            type=PaymentMilestone.Type.ADVANCE,
            percentage=50,
            status=PaymentMilestone.Status.READY,
        )

        # Project B (assigned to Consultant B, password protected)
        self.project_b = Project.objects.create(
            title="Project Beta",
            consultant=self.consultant_b,
            client=self.client_b,
            company_name="Beta Corp",
            portal_password_hash=make_password("pass-beta-456"),
            portal_token=uuid.uuid4(),
        )

        # Project C (passwordless)
        self.project_c = Project.objects.create(
            title="Project Gamma",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Gamma Corp",
            portal_password_hash="",
            portal_token=uuid.uuid4(),
        )

        # Clients for testing
        self.anon_client = APIClient()

        self.jwt_a_client = APIClient()
        token_a = str(RefreshToken.for_user(self.consultant_a).access_token)
        self.jwt_a_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_a}")

        self.jwt_b_client = APIClient()
        token_b = str(RefreshToken.for_user(self.consultant_b).access_token)
        self.jwt_b_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_b}")

        self.jwt_staff_client = APIClient()
        token_staff = str(RefreshToken.for_user(self.staff_user).access_token)
        self.jwt_staff_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_staff}")

    def test_01_clean_incognito_anonymous_returns_403_not_401(self):
        """1. Clean Incognito + valid protected link -> explicit password-required 403, NEVER 401."""
        url = f"/api/client-portal/{self.project_a.portal_token}/"
        res = self.anon_client.get(url)
        self.assertEqual(res.status_code, 403)
        self.assertIn("password", res.data["detail"].lower())
        self.assertNotEqual(res.status_code, 401)

    def test_02_wrong_password_rejected(self):
        """2. Wrong password -> rejected with 400 Bad Request."""
        url = f"/api/client-portal/{self.project_a.portal_token}/verify-password/"
        res = self.anon_client.post(url, {"password": "wrong-password-xyz"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("incorrect", res.data["detail"].lower())

    def test_03_correct_password_sets_cookie_and_grants_access(self):
        """3. Correct password -> 200 and signed portal cookie."""
        url = f"/api/client-portal/{self.project_a.portal_token}/verify-password/"
        res = self.anon_client.post(url, {"password": "correct-pass-123"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get("success"))
        self.assertIn(PORTAL_ACCESS_COOKIE_NAME, res.cookies)

    def test_04_valid_signed_client_cookie_returns_200(self):
        """4. Valid signed client cookie -> HTTP 200 with project payload."""
        verified_client = APIClient()
        cookie_val = sign_portal_access_token(str(self.project_a.portal_token))
        verified_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val

        url = f"/api/client-portal/{self.project_a.portal_token}/"
        res = verified_client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company_name"], "Alpha Corp")

    def test_05_missing_forged_expired_cross_project_cookies_denied_with_403(self):
        """5. Forged, expired, and cross-project cookies -> 403 password required."""
        url = f"/api/client-portal/{self.project_a.portal_token}/"

        # Forged cookie
        forged_client = APIClient()
        forged_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = "forged.signature.token"
        res = forged_client.get(url)
        self.assertEqual(res.status_code, 403)
        self.assertIn("password", res.data["detail"].lower())

        # Cross-project cookie (signed for Project B used on Project A)
        cross_client = APIClient()
        cross_cookie = sign_portal_access_token(str(self.project_b.portal_token))
        cross_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cross_cookie
        res = cross_client.get(url)
        self.assertEqual(res.status_code, 403)
        self.assertIn("password", res.data["detail"].lower())

    def test_06_matching_portal_token_header_alone_denied(self):
        """6. X-Client-Portal-Token header alone does not grant access."""
        url = f"/api/client-portal/{self.project_a.portal_token}/"
        res = self.anon_client.get(url, HTTP_X_CLIENT_PORTAL_TOKEN=str(self.project_a.portal_token))
        self.assertEqual(res.status_code, 403)
        self.assertIn("password", res.data["detail"].lower())

    def test_07_assigned_consultant_normal_url_no_silent_support_mode(self):
        """7. Assigned consultant on normal client URL (no Support Mode) does NOT silently enter."""
        url = f"/api/client-portal/{self.project_a.portal_token}/"
        res = self.jwt_a_client.get(url)
        # Must require client password verification since Support Mode was not requested
        self.assertEqual(res.status_code, 403)
        self.assertIn("password", res.data["detail"].lower())

    def test_08_assigned_consultant_explicit_support_mode_allowed(self):
        """8. Assigned consultant with explicit Support Mode signals enters successfully."""
        url = f"/api/client-portal/{self.project_a.portal_token}/"

        # via ?mode=consultant
        res1 = self.jwt_a_client.get(f"{url}?mode=consultant")
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.data["company_name"], "Alpha Corp")

        # via ?support=true
        res2 = self.jwt_a_client.get(f"{url}?support=true")
        self.assertEqual(res2.status_code, 200)

        # via ?consultant=true
        res3 = self.jwt_a_client.get(f"{url}?consultant=true")
        self.assertEqual(res3.status_code, 200)

        # via X-Support-Mode header
        res4 = self.jwt_a_client.get(url, HTTP_X_SUPPORT_MODE="true")
        self.assertEqual(res4.status_code, 200)

    def test_09_consultant_support_mode_cannot_perform_client_only_actions(self):
        """9. Consultant in Support Mode cannot sign agreements, pay, or sign off (zero mutations)."""
        token = str(self.project_a.portal_token)
        headers = {
            "HTTP_X_CLIENT_PORTAL_TOKEN": token,
            "HTTP_X_SUPPORT_MODE": "true",
        }

        # 1. Agreement sign
        sign_url = f"/api/client-portal/{token}/agreement/sign/?mode=consultant"
        res_sign = self.jwt_a_client.post(
            sign_url,
            {"full_name": "Consultant Impersonator", "agreed_terms": True},
            format="json",
            **headers,
        )
        self.assertEqual(res_sign.status_code, 403)
        self.assertIn("support mode", res_sign.data["detail"].lower())
        # Verify non-mutation
        self.agreement_a.refresh_from_db()
        self.assertEqual(self.agreement_a.status, "draft")

        # 2. Generated agreement accept
        gen_url = f"/api/client-portal/{token}/generated-agreement/accept/?mode=consultant"
        res_gen = self.jwt_a_client.post(gen_url, {"accepted": True}, format="json", **headers)
        self.assertEqual(res_gen.status_code, 403)

        # 3. Create payment order
        pay_url = f"/api/client-portal/{token}/payments/{self.milestone_a.id}/create-order/?mode=consultant"
        res_pay = self.jwt_a_client.post(pay_url, {}, format="json", **headers)
        self.assertEqual(res_pay.status_code, 403)
        self.milestone_a.refresh_from_db()
        self.assertEqual(self.milestone_a.status, PaymentMilestone.Status.READY)

        # 4. Sign off
        signoff_url = f"/api/client-portal/{token}/sign-off/?mode=consultant"
        res_off = self.jwt_a_client.post(signoff_url, {"feedback": "Good job"}, format="json", **headers)
        self.assertEqual(res_off.status_code, 403)
        self.project_a.refresh_from_db()
        self.assertFalse(self.project_a.client_signed_off)

    def test_10_unassigned_consultant_denied_access(self):
        """10. Unassigned consultant (normal or Support Mode URL) -> 403 permission denied."""
        token = str(self.project_a.portal_token)
        url_normal = f"/api/client-portal/{token}/"
        url_support = f"/api/client-portal/{token}/?mode=consultant"

        res_norm = self.jwt_b_client.get(url_normal)
        self.assertEqual(res_norm.status_code, 403)
        self.assertIn("not the assigned consultant", res_norm.data["detail"].lower())

        res_supp = self.jwt_b_client.get(url_support)
        self.assertEqual(res_supp.status_code, 403)
        self.assertIn("not the assigned consultant", res_supp.data["detail"].lower())

    def test_11_staff_user_cannot_bypass_unassigned_project(self):
        """11. Staff user not assigned to project -> 403."""
        token = str(self.project_a.portal_token)
        res = self.jwt_staff_client.get(f"/api/client-portal/{token}/?mode=consultant")
        self.assertEqual(res.status_code, 403)
        self.assertIn("not the assigned consultant", res.data["detail"].lower())

    def test_12_malformed_and_nonexistent_token_returns_404(self):
        """12. Malformed or nonexistent token -> HTTP 404."""
        res_bad = self.anon_client.get("/api/client-portal/invalid-uuid-string/")
        self.assertEqual(res_bad.status_code, 404)

        random_uuid = uuid.uuid4()
        res_missing = self.anon_client.get(f"/api/client-portal/{random_uuid}/")
        self.assertEqual(res_missing.status_code, 404)

    def test_13_passwordless_portal_accessible(self):
        """13. Passwordless portal -> HTTP 200 without password."""
        token = str(self.project_c.portal_token)
        res = self.anon_client.get(f"/api/client-portal/{token}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["company_name"], "Gamma Corp")

    def test_14_consultant_support_mode_can_view_discovery(self):
        """14. Consultant in Support Mode CAN view discovery data."""
        token = str(self.project_a.portal_token)
        url = f"/api/client-portal/{token}/discovery/?mode=consultant"
        res = self.jwt_a_client.get(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["what_business_does"], "Alpha Corp Description")
