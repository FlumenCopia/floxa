from rest_framework import serializers
from .models import Consultant
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken


class ConsultantRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Consultant
        fields = ["id", "name", "email", "password"]

    def create(self, validated_data):
        return Consultant.objects.create_user(
            email=validated_data["email"],
            name=validated_data["name"],
            password=validated_data["password"]
        )


class ConsultantLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get("email")
        password = data.get("password")

        consultant = authenticate(
            username=email,
            password=password
        )

        if consultant is None:
            raise serializers.ValidationError("Invalid email or password")

        if not consultant.is_active:
            raise serializers.ValidationError("Consultant account is inactive")

        refresh = RefreshToken.for_user(consultant)

        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "consultant": {
                "id": consultant.id,
                "name": consultant.name,
                "email": consultant.email,
            }
        }


class ConsultantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Consultant
        fields = ["id", "name", "email", "company", "phone"]
        read_only_fields = ["id", "email"]


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField(write_only=True)

    def validate(self, data):
        token_str = data.get("credential", "").strip()
        if not token_str:
            raise serializers.ValidationError({"credential": "Google credential token is required."})

        from django.conf import settings
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        google_client_id = getattr(settings, "GOOGLE_CLIENT_ID", "").strip() or None

        try:
            id_info = id_token.verify_oauth2_token(
                token_str,
                google_requests.Request(),
                audience=google_client_id,
                clock_skew_in_seconds=10,
            )
        except Exception:
            raise serializers.ValidationError({"detail": "Invalid or expired Google authentication token."})

        iss = id_info.get("iss", "")
        if iss not in ["accounts.google.com", "https://accounts.google.com"]:
            raise serializers.ValidationError({"detail": "Invalid Google token issuer."})

        email = (id_info.get("email") or "").strip().lower()
        email_verified = id_info.get("email_verified", False)
        if not email or not email_verified:
            raise serializers.ValidationError({"detail": "Google account email is missing or unverified."})

        name = (id_info.get("name") or "").strip() or email.split("@")[0]

        consultant = Consultant.objects.filter(email__iexact=email).first()
        if consultant:
            if not consultant.is_active:
                raise serializers.ValidationError({"detail": "Consultant account is inactive."})
        else:
            consultant = Consultant.objects.create(
                email=email,
                name=name,
                is_active=True,
            )
            consultant.set_unusable_password()
            consultant.save()

        refresh = RefreshToken.for_user(consultant)

        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "consultant": {
                "id": consultant.id,
                "name": consultant.name,
                "email": consultant.email,
            },
        }

