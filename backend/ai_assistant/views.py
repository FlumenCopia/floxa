from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import (
    GeminiConfigurationError,
    GeminiInvalidRequestError,
    GeminiServiceError,
    generate_response,
)


class GeminiTestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        prompt = request.data.get("prompt")

        if not isinstance(prompt, str):
            return Response(
                {"detail": "Prompt must be a string."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            response_text = generate_response(prompt)
        except GeminiInvalidRequestError as error:
            return Response(
                {"detail": error.public_message},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except GeminiConfigurationError as error:
            return Response(
                {"detail": error.public_message},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except GeminiServiceError as error:
            return Response(
                {"detail": error.public_message},
                status=getattr(error, "status_code", status.HTTP_503_SERVICE_UNAVAILABLE),
            )

        return Response({"response": response_text}, status=status.HTTP_200_OK)
