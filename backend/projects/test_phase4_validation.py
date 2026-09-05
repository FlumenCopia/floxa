from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from projects.models import Client, ClientProfile, Project
from projects.serializers import ClientProfileSerializer
from projects.views import PORTAL_ACCESS_COOKIE_NAME, sign_portal_access_token

User = get_user_model()


@override_settings(DEBUG=True)
class Phase4ProfileValidationTests(TestCase):
    def setUp(self):
        self.consultant = User.objects.create_user(
            email="consultant_phase4@example.com",
            password="password123",
            name="Consultant Phase4",
        )
        self.other_consultant = User.objects.create_user(
            email="other_phase4@example.com",
            password="password123",
            name="Other Consultant",
        )
        self.client_user = Client.objects.create(
            name="Acme Client",
            email="client_phase4@example.com",
            company_name="Acme Inc",
            sector="Technology",
        )
        self.project = Project.objects.create(
            title="Phase4 Project",
            consultant=self.consultant,
            client=self.client_user,
            company_name="Acme Inc",
            sector="Technology",
            portal_password_hash="pbkdf2_sha256$testpassword",
        )
        self.profile = ClientProfile.objects.create(
            project=self.project,
            client_name="Acme Client",
            company_name="Acme Inc",
            email="client_phase4@example.com",
            phone="1234567890",
            industry="Technology",
            location="San Francisco",
            website="https://acme.example.com",
            year_started=2020,
        )

        self.consultant_jwt = APIClient()
        self.consultant_jwt.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.consultant).access_token}"
        )

        self.other_jwt = APIClient()
        self.other_jwt.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.other_consultant).access_token}"
        )

        self.client_api = APIClient()
        self.client_api.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.project.portal_token)
        self.client_headers = {"HTTP_X_CLIENT_PORTAL_TOKEN": str(self.project.portal_token)}

    # 1. Phone validation tests
    def test_phone_validation_blank_and_optional(self):
        """Phone is optional: empty string and whitespace are accepted and cleaned."""
        serializer = ClientProfileSerializer(data={
            "client_name": "Test Name",
            "company_name": "Test Co",
            "phone": "",
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["phone"], "")

        serializer_ws = ClientProfileSerializer(data={
            "client_name": "Test Name",
            "company_name": "Test Co",
            "phone": "   ",
        })
        self.assertTrue(serializer_ws.is_valid(), serializer_ws.errors)
        self.assertEqual(serializer_ws.validated_data["phone"], "")

    def test_phone_validation_local_and_international_formats(self):
        """Valid local 10-digit and international E.164 formats are accepted."""
        valid_phones = [
            "1234567890",
            "555-123-4567",
            "(555) 123-4567",
            "+1 555-123-4567",
            "+44 20 7946 0958",
            "+91 9876543210",
            "+15551234567",
            "123.456.7890",
            "+61 2 9876 5432",
        ]
        for phone in valid_phones:
            serializer = ClientProfileSerializer(data={
                "client_name": "Test",
                "company_name": "Test",
                "phone": phone,
            })
            self.assertTrue(serializer.is_valid(), f"Failed for valid phone: {phone} - {serializer.errors}")

    def test_phone_validation_invalid_formats_rejected(self):
        """Letters, malformed plus signs, too short, too long, or punctuation-only values are rejected."""
        invalid_phones = [
            "12345",              # Too short (< 7 digits)
            "12345678901234567",  # Too long (> 15 digits)
            "555-CALL-NOW",       # Letters
            "123+456+7890",       # Plus not at beginning
            "+---()",             # Punctuation only (0 digits)
            "++15551234567",      # Double plus
            "phone12345678",      # Letters + digits
        ]
        for phone in invalid_phones:
            serializer = ClientProfileSerializer(data={
                "client_name": "Test",
                "company_name": "Test",
                "phone": phone,
            })
            self.assertFalse(serializer.is_valid(), f"Should have failed for invalid phone: {phone}")
            self.assertIn("phone", serializer.errors)

    # 2. Website normalization tests
    def test_website_normalization_bare_domain_and_urls(self):
        """Bare domain is normalized to https://, full URLs preserved, whitespace trimmed."""
        # Bare domain
        s1 = ClientProfileSerializer(data={"website": "example.com"})
        self.assertTrue(s1.is_valid(), s1.errors)
        self.assertEqual(s1.validated_data["website"], "https://example.com")

        # Full https URL
        s2 = ClientProfileSerializer(data={"website": "https://mybrand.io/path?id=1"})
        self.assertTrue(s2.is_valid(), s2.errors)
        self.assertEqual(s2.validated_data["website"], "https://mybrand.io/path?id=1")

        # Full http URL
        s3 = ClientProfileSerializer(data={"website": "http://legacy.example.org"})
        self.assertTrue(s3.is_valid(), s3.errors)
        self.assertEqual(s3.validated_data["website"], "http://legacy.example.org")

        # Whitespace
        s4 = ClientProfileSerializer(data={"website": "  brand.com/home  "})
        self.assertTrue(s4.is_valid(), s4.errors)
        self.assertEqual(s4.validated_data["website"], "https://brand.com/home")

        # Empty
        s5 = ClientProfileSerializer(data={"website": ""})
        self.assertTrue(s5.is_valid(), s5.errors)
        self.assertEqual(s5.validated_data["website"], "")

    def test_website_invalid_format_rejected(self):
        """Malformed URLs (invalid host/characters) are rejected."""
        s = ClientProfileSerializer(data={"website": "not a website with spaces"})
        self.assertFalse(s.is_valid())
        self.assertIn("website", s.errors)

    # 3. Profile persistence & error handling API tests
    def test_client_portal_save_profile_persists_valid_data(self):
        """Client portal can submit valid profile update and reload persisted data."""
        payload = {
            "client_name": "Jane Doe Updated",
            "company_name": "Acme Global",
            "industry": "Finance & Banking",
            "year_started": 2018,
            "location": "London, UK",
            "phone": "+44 20 7946 0958",
            "email": "jane@acmeglobal.co.uk",
            "website": "acmeglobal.co.uk",
        }
        res = self.client_api.post(
            f"/api/projects/{self.project.id}/client-profile/",
            payload,
            format="json",
            **self.client_headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_name"], "Jane Doe Updated")
        self.assertEqual(res.data["phone"], "+44 20 7946 0958")
        self.assertEqual(res.data["website"], "https://acmeglobal.co.uk")

        # Reload from database
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.client_name, "Jane Doe Updated")
        self.assertEqual(self.profile.phone, "+44 20 7946 0958")
        self.assertEqual(self.profile.website, "https://acmeglobal.co.uk")

    def test_invalid_profile_submission_returns_field_errors_without_mutating_db(self):
        """Invalid profile submission returns 400 with specific field errors and does not mutate db."""
        original_name = self.profile.client_name
        original_phone = self.profile.phone

        invalid_payload = {
            "client_name": "Valid Name",
            "phone": "invalid-phone-abc",
            "year_started": 1500,  # invalid year (< 1800)
        }
        res = self.client_api.post(
            f"/api/projects/{self.project.id}/client-profile/",
            invalid_payload,
            format="json",
            **self.client_headers,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("phone", res.data)
        self.assertIn("year_started", res.data)

        # Confirm DB unchanged
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.client_name, original_name)
        self.assertEqual(self.profile.phone, original_phone)

    def test_consultant_authenticated_profile_support_editing(self):
        """Assigned consultant can view and update client profile via JWT."""
        payload = {
            "client_name": "Consultant Edited Client",
            "company_name": "Acme Inc",
            "phone": "+1 555-999-8888",
        }
        res = self.consultant_jwt.post(
            f"/api/projects/{self.project.id}/client-profile/",
            payload,
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["client_name"], "Consultant Edited Client")

    def test_unauthorized_consultant_cannot_access_profile(self):
        """Unauthorized consultant cannot view or edit client profile (returns 404)."""
        res = self.other_jwt.get(f"/api/projects/{self.project.id}/client-profile/")
        self.assertEqual(res.status_code, 404)

        res_post = self.other_jwt.post(
            f"/api/projects/{self.project.id}/client-profile/",
            {"client_name": "Hacked"},
            format="json",
        )
        self.assertEqual(res_post.status_code, 404)

    # 4. VAL-003: Portal link handling tests
    def test_nonexistent_portal_token_returns_404(self):
        """VAL-003: Nonexistent portal token returns 404 Not Found, not 403 password verification."""
        anon = APIClient()
        res = anon.get("/api/client-portal/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data["detail"], "Client portal link not found.")

    def test_malformed_portal_token_returns_404(self):
        """VAL-003: Malformed portal token returns 404 Not Found."""
        anon = APIClient()
        res = anon.get("/api/client-portal/invalid-token-string-!@#$/")
        self.assertEqual(res.status_code, 404)
        if hasattr(res, "data") and res.data:
            self.assertEqual(res.data.get("detail"), "Client portal link not found.")

    def test_valid_protected_portal_without_verification_returns_403(self):
        """Existing password-protected portal without cookie returns 403 password verification required."""
        anon = APIClient()
        res = anon.get(f"/api/client-portal/{self.project.portal_token}/")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data["detail"], "Portal password verification required.")

    def test_valid_protected_portal_with_verification_returns_200(self):
        """Existing password-protected portal with valid cookie returns 200 with project data."""
        res = self.client_api.get(f"/api/client-portal/{self.project.portal_token}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["project_id"], self.project.id)
        self.assertEqual(res.data["company_name"], "Acme Inc")

    def test_unauthorized_consultant_portal_access_denied(self):
        """Consultant accessing a portal for a project they do not own is denied (403)."""
        res = self.other_jwt.get(f"/api/client-portal/{self.project.portal_token}/")
        self.assertEqual(res.status_code, 403)

    # 5. Consultant Account settings save endpoint tests
    def test_consultant_account_save_endpoint_valid_data(self):
        """Consultant can save name, company, and international phone via PATCH /api/auth/me/."""
        payload = {
            "name": "Updated Consultant Name",
            "company": "Updated Consulting LLC",
            "phone": "+44 20 7946 0958",
        }
        res = self.consultant_jwt.patch("/api/auth/me/", payload, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["name"], "Updated Consultant Name")
        self.assertEqual(res.data["company"], "Updated Consulting LLC")
        self.assertEqual(res.data["phone"], "+44 20 7946 0958")

        self.consultant.refresh_from_db()
        self.assertEqual(self.consultant.name, "Updated Consultant Name")
        self.assertEqual(self.consultant.phone, "+44 20 7946 0958")

    def test_consultant_account_save_endpoint_optional_blank_phone(self):
        """Consultant can save blank phone via PATCH /api/auth/me/."""
        payload = {
            "phone": "",
        }
        res = self.consultant_jwt.patch("/api/auth/me/", payload, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["phone"], "")

    def test_consultant_account_save_endpoint_invalid_phone_rejected(self):
        """Invalid phone formats rejected with 400 on PATCH /api/auth/me/."""
        payload = {
            "phone": "invalid_phone!@#",
        }
        res = self.consultant_jwt.patch("/api/auth/me/", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("phone", res.data)
