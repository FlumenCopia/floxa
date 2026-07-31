from django.conf import settings
from django.test import TestCase


class DeploymentConfigurationTests(TestCase):
    def test_default_local_origins_and_hosts_preserved(self):
        self.assertIn("http://localhost:3000", settings.CORS_ALLOWED_ORIGINS)
        self.assertIn("http://127.0.0.1:3000", settings.CORS_ALLOWED_ORIGINS)
        self.assertIn("http://localhost:3000", settings.CSRF_TRUSTED_ORIGINS)
        self.assertIn("http://127.0.0.1:3000", settings.CSRF_TRUSTED_ORIGINS)
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

