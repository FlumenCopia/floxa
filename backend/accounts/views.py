from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import ConsultantLoginSerializer, ConsultantRegisterSerializer, ConsultantSerializer


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

            return Response(
                {
                    "message": "Consultant registered successfully",
                    "consultant": {
                        "id": consultant.id,
                        "name": consultant.name,
                        "email": consultant.email,
                    }
                },
                status=status.HTTP_201_CREATED
            )

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

            response.set_cookie(
                settings.AUTH_ACCESS_COOKIE_NAME,
                serializer.validated_data["access"],
                httponly=settings.AUTH_COOKIE_HTTP_ONLY,
                secure=settings.AUTH_COOKIE_SECURE,
                samesite=settings.AUTH_COOKIE_SAMESITE,
                path=settings.AUTH_COOKIE_PATH,
            )
            response.set_cookie(
                settings.AUTH_REFRESH_COOKIE_NAME,
                serializer.validated_data["refresh"],
                httponly=settings.AUTH_COOKIE_HTTP_ONLY,
                secure=settings.AUTH_COOKIE_SECURE,
                samesite=settings.AUTH_COOKIE_SAMESITE,
                path=settings.AUTH_COOKIE_PATH,
            )

            return response

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
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
        response.set_cookie(
            settings.AUTH_ACCESS_COOKIE_NAME,
            access_token,
            httponly=settings.AUTH_COOKIE_HTTP_ONLY,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path=settings.AUTH_COOKIE_PATH,
        )

        return response


class ConsultantMeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = ConsultantSerializer(request.user)

        return Response(serializer.data)    

    def patch(self, request):
        serializer = ConsultantSerializer(
            request.user,
            data=request.data,
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ConsultantLogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(
            settings.AUTH_REFRESH_COOKIE_NAME
        ) or request.data.get("refresh")

        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except Exception:
                pass

        response = Response(
            {"detail": "Logout successful."},
            status=status.HTTP_200_OK,
        )
        response.delete_cookie(
            settings.AUTH_ACCESS_COOKIE_NAME,
            path=settings.AUTH_COOKIE_PATH,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            secure=settings.AUTH_COOKIE_SECURE,
        )
        response.delete_cookie(
            settings.AUTH_REFRESH_COOKIE_NAME,
            path=settings.AUTH_COOKIE_PATH,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            secure=settings.AUTH_COOKIE_SECURE,
        )

        return response
