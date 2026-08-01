import logging
import time
from dataclasses import dataclass

import httpx
import requests
from django.conf import settings
from google import genai
from google.genai import errors, types

logger = logging.getLogger(__name__)


class GeminiServiceError(Exception):
    status_code = 503
    public_message = "Gemini service is temporarily unavailable."


class GeminiConfigurationError(GeminiServiceError):
    public_message = "Gemini API is not configured."


class GeminiInvalidRequestError(GeminiServiceError):
    status_code = 400
    public_message = "Enter a valid prompt."


class GeminiAuthenticationError(GeminiServiceError):
    public_message = "Gemini API authentication failed."


class GeminiRateLimitError(GeminiServiceError):
    status_code = 429
    public_message = "AI usage limit reached. Please try again later."


class GeminiProviderError(GeminiServiceError):
    public_message = "Gemini service is temporarily unavailable."


@dataclass(frozen=True)
class GeminiAttemptFailure:
    model: str
    category: str


class GeminiAllModelsFailedError(GeminiProviderError):
    def __init__(self, failures):
        super().__init__(self.public_message)
        self.failures = failures

        if failures and all(item.category == "rate_limit" for item in failures):
            self.status_code = GeminiRateLimitError.status_code
            self.public_message = GeminiRateLimitError.public_message


def _get_configured_models():
    raw_models = [
        str(model).strip()
        for model in getattr(settings, "GEMINI_MODELS", [])
        if str(model).strip()
    ]
    unusable = {
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-pro-latest",
        "gemini-2.0-flash",
        "gemini-flash-latest",
    }
    verified_models = []
    for model in raw_models:
        if model not in unusable and model not in verified_models:
            verified_models.append(model)

    if not verified_models:
        verified_models = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"]

    return verified_models


def _get_client():
    api_key = str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()

    if not api_key:
        raise GeminiConfigurationError()

    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=int(getattr(settings, "GEMINI_TIMEOUT_SECONDS", 20)) * 1000,
        ),
    )


def _extract_text_and_meta(response):
    text = getattr(response, "text", None)
    if isinstance(text, str) and text.strip():
        return text.strip(), "STOP"

    output_text = getattr(response, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip(), "STOP"

    candidates = getattr(response, "candidates", None) or []
    finish_reason = None

    for candidate in candidates:
        if finish_reason is None:
            finish_reason = getattr(candidate, "finish_reason", None)

        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        extracted_parts = []

        for part in parts:
            part_text = getattr(part, "text", None)
            if isinstance(part_text, str) and part_text.strip():
                extracted_parts.append(part_text.strip())

        if extracted_parts:
            joined = " ".join(extracted_parts).strip()
            if joined:
                return joined, str(finish_reason or "STOP")

    prompt_feedback = getattr(response, "prompt_feedback", None)
    if prompt_feedback and finish_reason is None:
        finish_reason = getattr(prompt_feedback, "block_reason", None)

    return "", str(finish_reason or "UNKNOWN")


def _get_error_status_code(error):
    for attr in ("code", "status_code"):
        value = getattr(error, attr, None)

        if isinstance(value, int):
            return value

    response = getattr(error, "response", None)
    value = getattr(response, "status_code", None)

    return value if isinstance(value, int) else None


def _classify_provider_error(error):
    status_code = _get_error_status_code(error)

    if status_code in {401, 403}:
        return "authentication"

    if status_code == 429:
        return "rate_limit"

    if status_code in {400, 404}:
        return "model_unavailable"

    if status_code in {500, 502, 503, 504}:
        return "temporary"

    if isinstance(error, errors.ServerError):
        return "temporary"

    return "provider"


def _should_try_next_model(category):
    return category in {
        "rate_limit",
        "model_unavailable",
        "temporary",
        "network",
        "provider",
    }


def _raise_final_error(failures):
    if failures and all(item.category == "authentication" for item in failures):
        raise GeminiAuthenticationError()

    if failures and all(item.category == "rate_limit" for item in failures):
        raise GeminiRateLimitError()

    raise GeminiAllModelsFailedError(failures)


def generate_response(prompt):
    prompt_text = str(prompt or "").strip()

    if not prompt_text:
        raise GeminiInvalidRequestError()

    max_characters = int(getattr(settings, "GEMINI_MAX_INPUT_CHARACTERS", 12000))
    if len(prompt_text) > max_characters:
        raise GeminiInvalidRequestError()

    models = _get_configured_models()

    if not models:
        raise GeminiConfigurationError()

    client = _get_client()
    failures = []

    for model in models:
        t0 = time.perf_counter()
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt_text,
                config=types.GenerateContentConfig(
                    maxOutputTokens=int(
                        getattr(settings, "GEMINI_MAX_OUTPUT_TOKENS", 700)
                    ),
                    responseMimeType="text/plain",
                ),
            )
            t_duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            text, finish_reason = _extract_text_and_meta(response)
            has_text = bool(text)

            logger.info(
                "[Gemini Model Execution] model=%s, exception_class=None, status_code=200, finish_reason=%s, has_text=%s, duration_ms=%.2f",
                model,
                finish_reason,
                has_text,
                t_duration_ms,
            )

            if text:
                return text

            failures.append(GeminiAttemptFailure(model=model, category="empty_response"))
        except (httpx.TimeoutException, requests.Timeout) as error:
            t_duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            logger.info(
                "[Gemini Model Execution] model=%s, exception_class=%s, status_code=None, finish_reason=None, has_text=False, duration_ms=%.2f",
                model,
                error.__class__.__name__,
                t_duration_ms,
            )
            failures.append(GeminiAttemptFailure(model=model, category="temporary"))
        except (httpx.HTTPError, requests.RequestException) as error:
            t_duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            logger.info(
                "[Gemini Model Execution] model=%s, exception_class=%s, status_code=None, finish_reason=None, has_text=False, duration_ms=%.2f",
                model,
                error.__class__.__name__,
                t_duration_ms,
            )
            failures.append(GeminiAttemptFailure(model=model, category="network"))
        except (errors.ClientError, errors.APIError) as error:
            t_duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            category = _classify_provider_error(error)
            status_code = _get_error_status_code(error)
            logger.info(
                "[Gemini Model Execution] model=%s, exception_class=%s, status_code=%s, finish_reason=None, has_text=False, duration_ms=%.2f",
                model,
                error.__class__.__name__,
                status_code,
                t_duration_ms,
            )
            failures.append(GeminiAttemptFailure(model=model, category=category))

            if category == "authentication":
                break

            if not _should_try_next_model(category):
                break
        except Exception as error:
            t_duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            logger.info(
                "[Gemini Model Execution] model=%s, exception_class=%s, status_code=None, finish_reason=None, has_text=False, duration_ms=%.2f",
                model,
                error.__class__.__name__,
                t_duration_ms,
            )
            failures.append(GeminiAttemptFailure(model=model, category="provider"))

    _raise_final_error(failures)
