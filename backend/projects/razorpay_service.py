import hashlib
import hmac
import logging

from django.conf import settings


logger = logging.getLogger(__name__)


class RazorpayConfigurationError(Exception):
    pass


class RazorpayGatewayError(Exception):
    pass


class RazorpaySignatureVerificationError(Exception):
    pass


class RazorpayProviderError(Exception):
    pass


def get_razorpay_client():
    key_id = settings.RAZORPAY_KEY_ID
    key_secret = settings.RAZORPAY_KEY_SECRET

    if not key_id or not key_secret:
        logger.error("Razorpay configuration is missing.")
        raise RazorpayConfigurationError("Razorpay configuration is missing.")

    try:
        import razorpay
    except ImportError as error:
        logger.error("Razorpay SDK import failed.")
        raise RazorpayConfigurationError("Razorpay SDK is not installed.") from error

    return razorpay.Client(auth=(key_id, key_secret))


def create_razorpay_order(*, amount, currency, receipt, notes):
    client = get_razorpay_client()

    try:
        return client.order.create(
            {
                "amount": amount,
                "currency": currency,
                "receipt": receipt,
                "notes": notes,
            }
        )
    except Exception as error:
        logger.exception("Razorpay order creation failed.")
        raise RazorpayGatewayError("Razorpay order creation failed.") from error


def verify_razorpay_payment_signature(*, razorpay_order_id, razorpay_payment_id, razorpay_signature):
    client = get_razorpay_client()

    try:
        from razorpay import errors

        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
            }
        )
    except errors.SignatureVerificationError as error:
        raise RazorpaySignatureVerificationError("Razorpay payment signature verification failed.") from error
    except (errors.BadRequestError, errors.GatewayError, errors.ServerError) as error:
        logger.exception("Razorpay provider error during payment signature verification.")
        raise RazorpayProviderError("Razorpay signature verification is unavailable.") from error
    except Exception as error:
        logger.exception("Unexpected Razorpay runtime error during payment signature verification.")
        raise RazorpayProviderError("Razorpay signature verification failed unexpectedly.") from error


def fetch_razorpay_payment(razorpay_payment_id):
    client = get_razorpay_client()

    try:
        from razorpay import errors

        return client.payment.fetch(razorpay_payment_id)
    except (errors.BadRequestError, errors.GatewayError, errors.ServerError) as error:
        logger.exception("Razorpay provider error while fetching payment details.")
        raise RazorpayProviderError("Razorpay payment fetch failed.") from error
    except Exception as error:
        logger.exception("Unexpected Razorpay runtime error while fetching payment details.")
        raise RazorpayProviderError("Razorpay payment fetch failed unexpectedly.") from error


def verify_razorpay_webhook_signature(*, raw_body, razorpay_signature):
    webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET

    if not webhook_secret:
        logger.error("Razorpay webhook secret is missing.")
        raise RazorpayConfigurationError("Razorpay webhook configuration is missing.")

    if not razorpay_signature:
        raise RazorpaySignatureVerificationError("Razorpay webhook signature is missing.")

    body = raw_body if isinstance(raw_body, bytes) else str(raw_body or "").encode("utf-8")
    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, razorpay_signature):
        raise RazorpaySignatureVerificationError("Razorpay webhook signature verification failed.")
