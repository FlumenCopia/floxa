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
