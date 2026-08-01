from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

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

