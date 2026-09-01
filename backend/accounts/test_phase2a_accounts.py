from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()


class Phase2AAccountsValidationTests(TestCase):
    """
    Dedicated test suite for Phase 2A:
    Verifies consultant registration, login, profile management, field validation,
    and protected-field tampering prevention on the backend.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant = User.objects.create_user(
            email="existing_consultant@floxa.test",
            name="Alice Consultant",
            company="Floxa Design Studio",
            phone="+1234567890",
            password="StrongPassword123!",
        )

    def test_01_registration_with_all_fields_succeeds(self):
        """Verify new consultant registration with full profile fields."""
        payload = {
            "name": "Bob Designer",
            "email": "bob@newagency.test",
            "password": "SecurePassword456!",
            "company": "Bob Brand Co",
            "phone": "+1987654321",
        }
        res = self.client.post(reverse("register"), payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertIn("consultant", res.data)
        self.assertEqual(res.data["consultant"]["email"], "bob@newagency.test")
        self.assertEqual(res.data["consultant"]["name"], "Bob Designer")

        # Verify DB record
        created = User.objects.get(email="bob@newagency.test")
        self.assertEqual(created.company, "Bob Brand Co")
        self.assertEqual(created.phone, "+1987654321")
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)

    def test_02_registration_rejects_duplicate_email_case_insensitive(self):
        """Verify registration rejects existing emails even with uppercase letters."""
        payload = {
            "name": "Imposter",
            "email": "EXISTING_CONSULTANT@FLOXA.TEST",
            "password": "Password789!",
        }
        res = self.client.post(reverse("register"), payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("email", res.data)

    def test_03_registration_rejects_short_password_or_blank_name(self):
        """Verify registration rejects passwords < 8 characters or empty names."""
        short_pw_res = self.client.post(
            reverse("register"),
            {"name": "Valid Name", "email": "unique1@test.com", "password": "short"},
            format="json",
        )
        self.assertEqual(short_pw_res.status_code, 400)
        self.assertIn("password", short_pw_res.data)

        blank_name_res = self.client.post(
            reverse("register"),
            {"name": "   ", "email": "unique2@test.com", "password": "ValidPassword123!"},
            format="json",
        )
        self.assertEqual(blank_name_res.status_code, 400)
        self.assertIn("name", blank_name_res.data)

    def test_04_login_with_valid_and_invalid_credentials(self):
        """Verify consultant login returns JWT and consultant profile."""
        valid_res = self.client.post(
            reverse("login"),
            {"email": "existing_consultant@floxa.test", "password": "StrongPassword123!"},
            format="json",
        )
        self.assertEqual(valid_res.status_code, 200)
        self.assertEqual(valid_res.data["consultant"]["email"], "existing_consultant@floxa.test")
        self.assertEqual(valid_res.data["consultant"]["company"], "Floxa Design Studio")

        invalid_res = self.client.post(
            reverse("login"),
            {"email": "existing_consultant@floxa.test", "password": "WrongPassword!"},
            format="json",
        )
        self.assertEqual(invalid_res.status_code, 400)

    def test_05_profile_retrieval_and_update_succeeds(self):
        """Verify consultant can retrieve and update profile (name, company, phone)."""
        self.client.force_authenticate(user=self.consultant)

        # GET /api/auth/me/
        me_res = self.client.get(reverse("me"))
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.data["name"], "Alice Consultant")
        self.assertEqual(me_res.data["company"], "Floxa Design Studio")

        # PATCH /api/auth/me/
        patch_res = self.client.patch(
            reverse("me"),
            {"name": "Alice Senior Consultant", "company": "Floxa Global", "phone": "+1555444333"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["name"], "Alice Senior Consultant")
        self.assertEqual(patch_res.data["company"], "Floxa Global")
        self.assertEqual(patch_res.data["phone"], "+1555444333")

        # Verify DB updated
        self.consultant.refresh_from_db()
        self.assertEqual(self.consultant.name, "Alice Senior Consultant")
        self.assertEqual(self.consultant.company, "Floxa Global")

    def test_06_profile_update_blocks_tampering_of_protected_fields(self):
        """Verify attempting to inject is_staff, is_superuser, email, or password via PATCH /api/auth/me/ is blocked/ignored."""
        self.client.force_authenticate(user=self.consultant)

        old_email = self.consultant.email
        old_password_hash = self.consultant.password

        tampering_payload = {
            "name": "Alice Legitimate Name",
            "email": "hacker_email@evil.com",
            "is_staff": True,
            "is_superuser": True,
            "password": "HackedPassword123!",
            "id": 99999,
        }

        patch_res = self.client.patch(reverse("me"), tampering_payload, format="json")
        self.assertEqual(patch_res.status_code, 200)

        # Confirm that protected fields remained unchanged in DB
        self.consultant.refresh_from_db()
        self.assertEqual(self.consultant.name, "Alice Legitimate Name")
        self.assertEqual(self.consultant.email, old_email)
        self.assertEqual(self.consultant.password, old_password_hash)
        self.assertFalse(self.consultant.is_staff)
        self.assertFalse(self.consultant.is_superuser)

    def test_07_profile_update_validates_blank_name_and_invalid_phone(self):
        """Verify blank name and malformed phone numbers are rejected."""
        self.client.force_authenticate(user=self.consultant)

        blank_name_res = self.client.patch(reverse("me"), {"name": "   "}, format="json")
        self.assertEqual(blank_name_res.status_code, 400)
        self.assertIn("name", blank_name_res.data)

        bad_phone_res = self.client.patch(reverse("me"), {"phone": "not-a-number-1234567890!@#$"}, format="json")
        self.assertEqual(bad_phone_res.status_code, 400)
        self.assertIn("phone", bad_phone_res.data)

    def test_08_unauthenticated_me_requests_rejected(self):
        """Verify unauthenticated requests to /api/auth/me/ return 401."""
        anon_get = self.client.get(reverse("me"))
        self.assertEqual(anon_get.status_code, 401)

        anon_patch = self.client.patch(reverse("me"), {"name": "Hacker"}, format="json")
        self.assertEqual(anon_patch.status_code, 401)
