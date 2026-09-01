import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
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
)
from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    sign_portal_access_token,
)

User = get_user_model()


class Phase2BProjectDataValidationTests(TestCase):
    """
    Dedicated test suite for Phase 2B:
    Verifies project & client data boundaries, input ranges, protected field tampering,
    discovery submission validation, and multi-tenant isolation.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant_a = User.objects.create_user(
            email="consultant_a@floxa.test",
            name="Alice Consultant",
            password="StrongPassword123!",
        )
        self.consultant_b = User.objects.create_user(
            email="consultant_b@floxa.test",
            name="Bob Consultant",
            password="StrongPassword123!",
        )

        # Create Client and Project for Consultant A
        self.client_record = Client.objects.create(
            name="Acme Client",
            email="client@acme.test",
            company_name="Acme Corp",
            sector="SaaS",
        )
        self.project_a = Project.objects.create(
            consultant=self.consultant_a,
            client=self.client_record,
            title="Acme Corp",
            company_name="Acme Corp",
            sector="SaaS",
            project_value= Decimal("100000.00"),
            advance_percentage=50,
            mid_percentage=25,
            final_percentage=25,
            portal_token=uuid.uuid4(),
            status=Project.Status.CREATED,
        )

    def get_authenticated_client_portal(self, project=None):
        proj = project or self.project_a
        portal_client = APIClient()
        cookie_val = sign_portal_access_token(proj.portal_token)
        portal_client.cookies[PORTAL_ACCESS_COOKIE_NAME] = cookie_val
        portal_client.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=str(proj.portal_token))
        return portal_client

    def test_01_valid_project_creation_succeeds(self):
        """Verify consultant can create a project with valid parameters."""
        self.client.force_authenticate(user=self.consultant_a)

        payload = {
            "client": "John Valid",
            "email": "john@validcorp.test",
            "company": "Valid Corp",
            "sector": "Fintech",
            "value": "75000.00",
            "portal_password": "ValidPassword123!",
            "advance": 40,
            "mid": 30,
            "final": 30,
            "revisions": "2 revisions",
        }
        res = self.client.post(reverse("project-list-create"), payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertIn("project", res.data)
        self.assertEqual(res.data["project"]["company_name"], "Valid Corp")
        self.assertEqual(res.data["project"]["project_value"], "75000.00")

    def test_02_project_creation_rejects_negative_or_zero_value(self):
        """Verify project creation rejects value <= 0."""
        self.client.force_authenticate(user=self.consultant_a)

        bad_payload = {
            "client": "Test Client",
            "email": "test@negative.test",
            "company": "Bad Value Corp",
            "sector": "Retail",
            "value": "-5000.00",
            "portal_password": "Password123!",
            "advance": 50,
            "mid": 25,
            "final": 25,
        }
        res = self.client.post(reverse("project-list-create"), bad_payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("value", res.data)

        zero_payload = {**bad_payload, "value": "0.00"}
        res_zero = self.client.post(reverse("project-list-create"), zero_payload, format="json")
        self.assertEqual(res_zero.status_code, 400)
        self.assertIn("value", res_zero.data)

    def test_03_project_creation_rejects_invalid_split_sum(self):
        """Verify milestone split percentages must total exactly 100."""
        self.client.force_authenticate(user=self.consultant_a)

        bad_split = {
            "client": "Test Client",
            "email": "test@split.test",
            "company": "Bad Split Corp",
            "sector": "Retail",
            "value": "50000.00",
            "portal_password": "Password123!",
            "advance": 60,
            "mid": 30,
            "final": 20,  # 110%
        }
        res = self.client.post(reverse("project-list-create"), bad_split, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("payment_split", res.data)

    def test_04_project_creation_rejects_blank_fields_and_short_password(self):
        """Verify validation on required fields and password length."""
        self.client.force_authenticate(user=self.consultant_a)

        blank_company = {
            "client": "Test Client",
            "email": "test@blank.test",
            "company": "   ",
            "sector": "Retail",
            "value": "50000.00",
            "portal_password": "Password123!",
        }
        res = self.client.post(reverse("project-list-create"), blank_company, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("company", res.data)

        short_pw = {
            "client": "Test Client",
            "email": "test@shortpw.test",
            "company": "Short PW Corp",
            "sector": "Retail",
            "value": "50000.00",
            "portal_password": "short",
        }
        res_pw = self.client.post(reverse("project-list-create"), short_pw, format="json")
        self.assertEqual(res_pw.status_code, 400)
        self.assertIn("portal_password", res_pw.data)

    def test_05_cross_consultant_isolation_returns_404(self):
        """Verify Consultant B cannot read or modify Consultant A's project."""
        self.client.force_authenticate(user=self.consultant_b)

        # GET detail returns 404
        get_res = self.client.get(reverse("project-detail", kwargs={"pk": self.project_a.id}))
        self.assertEqual(get_res.status_code, 404)

        # GET discovery summary returns 404
        disc_res = self.client.get(reverse("project-discovery-summary", kwargs={"project_id": self.project_a.id}))
        self.assertEqual(disc_res.status_code, 404)

    def test_06_client_profile_validates_phone_and_year_started(self):
        """Verify client profile enforces 10-digit phone numbers and valid year range."""
        portal_client = self.get_authenticated_client_portal()

        # Valid profile
        valid_profile = {
            "client_name": "Jane Valid",
            "company_name": "Acme Corp",
            "industry": "SaaS",
            "year_started": 2022,
            "location": "Boston, MA",
            "phone": "9876543210",
            "email": "jane@acme.test",
        }
        res_valid = portal_client.post(
            reverse("project-client-profile", kwargs={"project_id": self.project_a.id}),
            valid_profile,
            format="json",
        )
        self.assertEqual(res_valid.status_code, 200)

        # Invalid phone format (not 10 digits)
        bad_phone = {**valid_profile, "phone": "12345"}
        res_phone = portal_client.post(
            reverse("project-client-profile", kwargs={"project_id": self.project_a.id}),
            bad_phone,
            format="json",
        )
        self.assertEqual(res_phone.status_code, 400)
        self.assertIn("phone", res_phone.data)

        # Invalid year_started
        bad_year = {**valid_profile, "year_started": 1500}
        res_year = portal_client.post(
            reverse("project-client-profile", kwargs={"project_id": self.project_a.id}),
            bad_year,
            format="json",
        )
        self.assertEqual(res_year.status_code, 400)
        self.assertIn("year_started", res_year.data)

    def test_07_discovery_slider_range_validation(self):
        """Verify slider value must be between 0 and 100."""
        portal_client = self.get_authenticated_client_portal()

        bad_slider_discovery = {
            "what_business_does": "Valid description of services.",
            "target_customer": "Enterprise buyers.",
            "why_choose_us": "Quality and speed.",
            "brand_feeling": "Professional.",
            "audience_archetype": "The Creator",
            "sliders": [
                {"slider_key": "modern_classic", "value": 150},  # Invalid > 100
            ],
            "emotions": [{"emotion": "Trusted"}],
            "competitors": [{"name": "Competitor A"}],
            "visual_styles": [{"style": "Minimal"}],
        }
        res = portal_client.post(
            reverse("project-discovery-submit", kwargs={"project_id": self.project_a.id}),
            bad_slider_discovery,
            format="json",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("sliders", res.data)

    def test_08_missing_client_portal_token_returns_403_or_404(self):
        """Verify direct API requests without valid portal token are rejected."""
        unauth_client = APIClient()

        # Submit without password/token cookie
        res = unauth_client.post(
            reverse("project-client-profile", kwargs={"project_id": self.project_a.id}),
            {"client_name": "Hacker"},
            format="json",
        )
        self.assertIn(res.status_code, [403, 404])
