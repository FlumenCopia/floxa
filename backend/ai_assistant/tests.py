from unittest.mock import MagicMock, patch
from django.conf import settings
from django.test import TestCase, override_settings
from google.genai import errors

from .services import (
    GeminiAuthenticationError,
    GeminiConfigurationError,
    GeminiInvalidRequestError,
    GeminiProviderError,
    GeminiRateLimitError,
    _extract_text_and_meta,
    _get_configured_models,
    generate_response,
)


class GeminiAssistantServiceTests(TestCase):
    @override_settings(GEMINI_MODELS=["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
    def test_default_models_do_not_contain_quota_exhausted_or_invalid_models(self):
        models = _get_configured_models()
        self.assertEqual(models, ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
        self.assertNotIn("gemini-2.5-flash", models)
        self.assertNotIn("gemini-pro-latest", models)
        self.assertNotIn("gemini-2.0-flash", models)

    def test_extract_text_and_meta_with_direct_text(self):
        mock_response = MagicMock()
        mock_response.text = "Direct model response text"
        text, finish_reason = _extract_text_and_meta(mock_response)
        self.assertEqual(text, "Direct model response text")
        self.assertEqual(finish_reason, "STOP")

    def test_extract_text_and_meta_when_text_is_none_but_candidates_contain_parts(self):
        mock_part = MagicMock()
        mock_part.text = "Candidate part text response"
        mock_content = MagicMock()
        mock_content.parts = [mock_part]
        mock_candidate = MagicMock()
        mock_candidate.content = mock_content
        mock_candidate.finish_reason = "STOP"

        mock_response = MagicMock()
        mock_response.text = None
        mock_response.output_text = None
        mock_response.candidates = [mock_candidate]

        text, finish_reason = _extract_text_and_meta(mock_response)
        self.assertEqual(text, "Candidate part text response")
        self.assertEqual(finish_reason, "STOP")

    @override_settings(GEMINI_API_KEY="test_key", GEMINI_MODELS=["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
    def test_primary_model_succeeds(self):
        mock_client = MagicMock()
        mock_res = MagicMock()
        mock_res.text = "Primary model response"
        mock_client.models.generate_content.return_value = mock_res

        with patch("ai_assistant.services._get_client", return_value=mock_client):
            result = generate_response("What is the project status?")
            self.assertEqual(result, "Primary model response")
            mock_client.models.generate_content.assert_called_once()
            self.assertEqual(mock_client.models.generate_content.call_args.kwargs["model"], "gemini-3.1-flash-lite")

    @override_settings(GEMINI_API_KEY="test_key", GEMINI_MODELS=["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
    def test_primary_returns_empty_and_fallback_succeeds(self):
        mock_client = MagicMock()

        empty_res = MagicMock()
        empty_res.text = None
        empty_res.output_text = None
        empty_res.candidates = []

        success_res = MagicMock()
        success_res.text = "Fallback model response"

        mock_client.models.generate_content.side_effect = [empty_res, success_res]

        with patch("ai_assistant.services._get_client", return_value=mock_client):
            result = generate_response("Test prompt")
            self.assertEqual(result, "Fallback model response")
            self.assertEqual(mock_client.models.generate_content.call_count, 2)

    @override_settings(GEMINI_API_KEY="test_key", GEMINI_MODELS=["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
    def test_all_models_return_429_raises_controlled_rate_limit_error(self):
        mock_client = MagicMock()
        error_429 = errors.ClientError(429, {"error": {"code": 429, "message": "Resource Exhausted"}}, None)
        mock_client.models.generate_content.side_effect = [error_429, error_429]

        with patch("ai_assistant.services._get_client", return_value=mock_client):
            with self.assertRaises(GeminiRateLimitError) as ctx:
                generate_response("Test rate limit")
            self.assertEqual(ctx.exception.status_code, 429)
            self.assertEqual(ctx.exception.public_message, "AI usage limit reached. Please try again later.")

    @override_settings(GEMINI_API_KEY="", GEMINI_MODELS=["gemini-3.1-flash-lite"])
    def test_missing_api_key_raises_configuration_error(self):
        with self.assertRaises(GeminiConfigurationError):
            generate_response("Test prompt")
