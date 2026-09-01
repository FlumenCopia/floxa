from django.conf import settings
from django.db import IntegrityError
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenBackendError, TokenError
from rest_framework_simplejwt.settings import api_settings as jwt_settings
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    ConsultantLoginSerializer,
    ConsultantRegisterSerializer,
    ConsultantSerializer,
    GoogleAuthSerializer,
)


def access_cookie_max_age():
    return int(jwt_settings.ACCESS_TOKEN_LIFETIME.total_seconds())


def refresh_cookie_max_age():
    return int(jwt_settings.REFRESH_TOKEN_LIFETIME.total_seconds())


def set_auth_cookies(response, access, refresh=None):
    response.set_cookie(
        settings.AUTH_ACCESS_COOKIE_NAME,
        access,
        max_age=access_cookie_max_age(),
        httponly=settings.AUTH_COOKIE_HTTP_ONLY,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,
    )
    if refresh is not None:
        response.set_cookie(
            settings.AUTH_REFRESH_COOKIE_NAME,
            refresh,
            max_age=refresh_cookie_max_age(),
            httponly=settings.AUTH_COOKIE_HTTP_ONLY,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path=settings.AUTH_COOKIE_PATH,
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfBootstrapView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        csrf_token = get_token(request)
        return Response({
            "detail": "CSRF cookie set.",
            "csrfToken": csrf_token,
            "csrf_token": csrf_token,
        })


class ConsultantRegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ConsultantRegisterSerializer(data=request.data)

        if serializer.is_valid():
            consultant = serializer.save()
            refresh = RefreshToken.for_user(consultant)
            access = str(refresh.access_token)

            response = Response(
                {
                    "message": "Consultant registered successfully",
                    "access": access,
                    "refresh": str(refresh),
                    "consultant": {
                        "id": consultant.id,
                        "name": consultant.name,
                        "email": consultant.email,
                    }
                },
                status=status.HTTP_201_CREATED
            )
            set_auth_cookies(response, access, str(refresh))
            return response

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ConsultantLoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ConsultantLoginSerializer(data=request.data)

        if serializer.is_valid():
            response = Response(
                serializer.validated_data,
                status=status.HTTP_200_OK
            )

            set_auth_cookies(
                response,
                serializer.validated_data["access"],
                serializer.validated_data["refresh"],
            )

            return response

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class ConsultantGoogleAuthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GoogleAuthSerializer(data=request.data)

        if serializer.is_valid():
            response = Response(
                serializer.validated_data,
                status=status.HTTP_200_OK,
            )

            set_auth_cookies(
                response,
                serializer.validated_data["access"],
                serializer.validated_data["refresh"],
            )

            return response

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )



class ConsultantTokenRefreshView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(
            settings.AUTH_REFRESH_COOKIE_NAME
        ) or request.data.get("refresh")

        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)
        except Exception:
            return Response(
                {"detail": "Invalid refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = Response(
            {"detail": "Token refreshed successfully."},
            status=status.HTTP_200_OK,
        )
        set_auth_cookies(response, access_token)

        return response


class ConsultantMeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        serializer = ConsultantSerializer(request.user, context={"request": request})
        return Response(serializer.data)

    def patch(self, request):
        serializer = ConsultantSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)





class ConsultantLogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = None
        if request.COOKIES:
            refresh_token = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)

        if not refresh_token and hasattr(request, "data") and isinstance(request.data, dict):
            refresh_token = request.data.get("refresh")

        if refresh_token and isinstance(refresh_token, str):
            refresh_token = refresh_token.strip()
            if refresh_token:
                try:
                    token = RefreshToken(refresh_token)
                    token.blacklist()
                except (TokenError, InvalidToken, TokenBackendError, IntegrityError):
                    pass

        response = Response(
            {"detail": "Logout successful."},
            status=status.HTTP_200_OK,
        )
        response.delete_cookie(
            settings.AUTH_ACCESS_COOKIE_NAME,
            path=settings.AUTH_COOKIE_PATH,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )
        response.delete_cookie(
            settings.AUTH_REFRESH_COOKIE_NAME,
            path=settings.AUTH_COOKIE_PATH,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )

        return response
