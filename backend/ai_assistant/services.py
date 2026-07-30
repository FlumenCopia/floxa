from dataclasses import dataclass

import httpx
import requests
from django.conf import settings
from google import genai
from google.genai import errors, types


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
    public_message = "Gemini API rate limit or quota was reached."


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
    return [
        str(model).strip()
        for model in getattr(settings, "GEMINI_MODELS", [])
        if str(model).strip()
    ]


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


def _extract_text(response):
    text = getattr(response, "text", None)

    if isinstance(text, str) and text.strip():
        return text.strip()

    output_text = getattr(response, "output_text", None)

    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    return ""


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

    raise GeminiAllModelsFailedError(failures)


def generate_response(prompt):
    prompt_text = str(prompt or "").strip()

    if not prompt_text:
        raise GeminiInvalidRequestError()

    if len(prompt_text) > 2000:
        raise GeminiInvalidRequestError()

    models = _get_configured_models()

    if not models:
        raise GeminiConfigurationError()

    client = _get_client()
    failures = []

    for model in models:
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
            text = _extract_text(response)

            if text:
                return text

            failures.append(GeminiAttemptFailure(model=model, category="empty_response"))
        except (httpx.TimeoutException, requests.Timeout):
            failures.append(GeminiAttemptFailure(model=model, category="temporary"))
        except (httpx.HTTPError, requests.RequestException):
            failures.append(GeminiAttemptFailure(model=model, category="network"))
        except errors.ClientError as error:
            category = _classify_provider_error(error)
            failures.append(GeminiAttemptFailure(model=model, category=category))

            if category == "authentication":
                break

            if not _should_try_next_model(category):
                break
        except errors.APIError as error:
            category = _classify_provider_error(error)
            failures.append(GeminiAttemptFailure(model=model, category=category))

            if not _should_try_next_model(category):
                break
        except Exception:
            failures.append(GeminiAttemptFailure(model=model, category="provider"))

    _raise_final_error(failures)
