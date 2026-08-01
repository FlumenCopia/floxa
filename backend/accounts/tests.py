from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

User = get_user_model()


class DeploymentConfigurationTests(TestCase):
    def test_default_local_origins_and_hosts_preserved(self):
        self.assertIn("http://localhost:3000", settings.CORS_ALLOWED_ORIGINS)
        self.assertIn("http://127.0.0.1:3000", settings.CORS_ALLOWED_ORIGINS)
        self.assertIn("https://floxa-frontend-test-lyart.vercel.app", settings.CORS_ALLOWED_ORIGINS)
        self.assertIn("http://localhost:3000", settings.CSRF_TRUSTED_ORIGINS)
        self.assertIn("http://127.0.0.1:3000", settings.CSRF_TRUSTED_ORIGINS)
        self.assertIn("https://floxa-frontend-test-lyart.vercel.app", settings.CSRF_TRUSTED_ORIGINS)
        self.assertTrue(settings.CORS_ALLOW_CREDENTIALS)

    def test_cookie_security_and_samesite_settings(self):
        self.assertIn(settings.AUTH_COOKIE_SAMESITE, ["Lax", "None", "Strict"])
        self.assertIn(settings.CSRF_COOKIE_SAMESITE, ["Lax", "None", "Strict"])
        self.assertIsInstance(settings.AUTH_COOKIE_SECURE, bool)
        self.assertIsInstance(settings.CSRF_COOKIE_SECURE, bool)

    def test_database_configuration_structure(self):
        db_config = settings.DATABASES["default"]
        self.assertEqual(db_config["ENGINE"], "django.db.backends.postgresql")
        if getattr(settings, "DB_SSL_REQUIRE", False):
            self.assertEqual(db_config.get("OPTIONS", {}).get("sslmode"), "require")
        else:
            self.assertNotEqual(db_config.get("OPTIONS", {}).get("sslmode"), "require")


class AuthenticationCookieTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="test@example.com",
            name="Test Consultant",
            password="TestPassword123!",
        )

    def test_login_sets_access_and_refresh_cookies(self):
        response = self.client.post(
            reverse("login"),
            {"email": "test@example.com", "password": "TestPassword123!"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(settings.AUTH_ACCESS_COOKIE_NAME, response.cookies)
        self.assertIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)

        access_cookie = response.cookies[settings.AUTH_ACCESS_COOKIE_NAME]
        refresh_cookie = response.cookies[settings.AUTH_REFRESH_COOKIE_NAME]

        self.assertTrue(access_cookie["httponly"])
        self.assertTrue(refresh_cookie["httponly"])
        self.assertEqual(access_cookie["path"], "/")
        self.assertEqual(refresh_cookie["path"], "/")
        self.assertEqual(access_cookie["samesite"], settings.AUTH_COOKIE_SAMESITE)
        self.assertEqual(refresh_cookie["samesite"], settings.AUTH_COOKIE_SAMESITE)


class CsrfAndProjectCreationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="csrf_user@example.com",
            name="CSRF Consultant",
            password="TestPassword123!",
        )

    def test_csrf_bootstrap_returns_token_in_json_and_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        response = client.get(reverse("csrf"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrftoken", response.cookies)
        self.assertIn("csrfToken", response.data)
        self.assertIn("csrf_token", response.data)
        self.assertTrue(len(response.data["csrfToken"]) > 0)

    def test_project_creation_succeeds_with_csrf_header(self):
        client = APIClient(enforce_csrf_checks=True)
        login_res = client.post(
            reverse("login"),
            {"email": "csrf_user@example.com", "password": "TestPassword123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)

        bootstrap_res = client.get(reverse("csrf"))
        csrf_token = bootstrap_res.data["csrfToken"]

        project_res = client.post(
            reverse("project-list-create"),
            {
                "client": "Jane Doe",
                "email": "jane@example.com",
                "company": "Acme Corp",
                "sector": "Tech",
                "value": "5000.00",
                "portal_password": "Password123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(project_res.status_code, 201)
        self.assertEqual(project_res.data["company_name"], "Acme Corp")

    def test_project_creation_fails_without_valid_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        login_res = client.post(
            reverse("login"),
            {"email": "csrf_user@example.com", "password": "TestPassword123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)

        project_res = client.post(
            reverse("project-list-create"),
            {
                "client": "John Doe",
                "email": "john@example.com",
                "company": "Bad Corp",
                "sector": "Tech",
                "value": "5000.00",
                "portal_password": "Password123!",
            },
            format="json",
        )
        self.assertEqual(project_res.status_code, 403)


class LogoutViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="logout_user@example.com",
            name="Logout Consultant",
            password="TestPassword123!",
        )

    def test_logout_with_valid_refresh_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        login_res = client.post(
            reverse("login"),
            {"email": "logout_user@example.com", "password": "TestPassword123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)

        bootstrap_res = client.get(reverse("csrf"))
        csrf_token = bootstrap_res.data["csrfToken"]

        refresh_token_str = login_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value

        logout_res = client.post(
            reverse("logout"),
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(logout_res.status_code, 200)
        self.assertEqual(logout_res.data["detail"], "Logout successful.")

        access_cookie = logout_res.cookies[settings.AUTH_ACCESS_COOKIE_NAME]
        refresh_cookie = logout_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(access_cookie.value, "")
        self.assertEqual(refresh_cookie.value, "")

        blacklisted = BlacklistedToken.objects.filter(token__token=refresh_token_str).exists()
        self.assertTrue(blacklisted)

    def test_logout_with_no_refresh_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        bootstrap_res = client.get(reverse("csrf"))
        csrf_token = bootstrap_res.data["csrfToken"]

        logout_res = client.post(
            reverse("logout"),
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(logout_res.status_code, 200)
        self.assertEqual(logout_res.data["detail"], "Logout successful.")

        access_cookie = logout_res.cookies[settings.AUTH_ACCESS_COOKIE_NAME]
        refresh_cookie = logout_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(access_cookie.value, "")
        self.assertEqual(refresh_cookie.value, "")

    def test_logout_with_invalid_refresh_cookie(self):
        client = APIClient(enforce_csrf_checks=True)
        bootstrap_res = client.get(reverse("csrf"))
        csrf_token = bootstrap_res.data["csrfToken"]

        client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = "invalid_malformed_token_string"

        logout_res = client.post(
            reverse("logout"),
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(logout_res.status_code, 200)
        self.assertEqual(logout_res.data["detail"], "Logout successful.")

        access_cookie = logout_res.cookies[settings.AUTH_ACCESS_COOKIE_NAME]
        refresh_cookie = logout_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(access_cookie.value, "")
        self.assertEqual(refresh_cookie.value, "")

    def test_logout_with_already_blacklisted_refresh_token(self):
        client = APIClient(enforce_csrf_checks=True)
        login_res = client.post(
            reverse("login"),
            {"email": "logout_user@example.com", "password": "TestPassword123!"},
            format="json",
        )
        self.assertEqual(login_res.status_code, 200)

        bootstrap_res = client.get(reverse("csrf"))
        csrf_token = bootstrap_res.data["csrfToken"]

        refresh_token_str = login_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME].value
        token_obj = RefreshToken(refresh_token_str)
        token_obj.blacklist()

        logout_res = client.post(
            reverse("logout"),
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(logout_res.status_code, 200)
        self.assertEqual(logout_res.data["detail"], "Logout successful.")

        access_cookie = logout_res.cookies[settings.AUTH_ACCESS_COOKIE_NAME]
        refresh_cookie = logout_res.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(access_cookie.value, "")
        self.assertEqual(refresh_cookie.value, "")

