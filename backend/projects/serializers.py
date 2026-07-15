from rest_framework import serializers
from .models import Client, Project

from rest_framework import serializers
from .models import Client, Project


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_email = serializers.EmailField(source="client.email", read_only=True)

    class Meta:
        model = Project
        fields = [
            "id",
            "title",
            "company_name",
            "sector",
            "status",
            "project_value",
            "advance_percentage",
            "mid_percentage",
            "final_percentage",
            "revision_limit",
            "portal_token",
            "progress",
            "is_archived",
            "client_name",
            "client_email",
            "created_at",
            "updated_at",
        ]


class ProjectCreateSerializer(serializers.Serializer):
    client = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    company = serializers.CharField(max_length=255)
    sector = serializers.CharField(max_length=100)
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    advance = serializers.IntegerField(required=False, default=50, min_value=0, max_value=100)
    mid = serializers.IntegerField(required=False, default=25, min_value=0, max_value=100)
    final = serializers.IntegerField(required=False, default=25, min_value=0, max_value=100)
    revisions = serializers.CharField(max_length=50, required=False, allow_blank=True, default="3 revisions")

    def create(self, validated_data):
        consultant = self.context["request"].user

        client = Client.objects.create(
            name=validated_data["client"],
            email=validated_data["email"],
            company_name=validated_data["company"],
            sector=validated_data["sector"],
        )

        project = Project.objects.create(
            consultant=consultant,
            client=client,
            title=validated_data["company"],
            company_name=validated_data["company"],
            sector=validated_data["sector"],
            project_value=validated_data["value"],
            advance_percentage=validated_data["advance"],
            mid_percentage=validated_data["mid"],
            final_percentage=validated_data["final"],
            revision_limit=validated_data["revisions"] or "3 revisions",
            status=Project.Status.DISCOVERY,
            progress=20,
        )

        return project
