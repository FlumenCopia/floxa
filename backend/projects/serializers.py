from rest_framework import serializers
from .models import (
    BrandDNA,
    Client,
    ClientProfile,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoverySliderResponse,
    DiscoveryVisualStyle,
    Moodboard,
    Project,
    ProjectActivity,
    ProjectDiscovery,
)


class ClientProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientProfile
        fields = [
            "id",
            "client_name",
            "company_name",
            "industry",
            "year_started",
            "location",
            "phone",
            "email",
            "website",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class DiscoverySliderResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoverySliderResponse
        fields = [
            "id",
            "slider_key",
            "left_label",
            "right_label",
            "value",
        ]
        read_only_fields = ["id"]


class DiscoveryEmotionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveryEmotion
        fields = [
            "id",
            "emotion",
        ]
        read_only_fields = ["id"]


class DiscoveryCompetitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveryCompetitor
        fields = [
            "id",
            "name",
            "rating",
            "reason",
        ]
        read_only_fields = ["id"]


class DiscoveryVisualStyleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoveryVisualStyle
        fields = [
            "id",
            "style",
        ]
        read_only_fields = ["id"]


class ProjectDiscoverySerializer(serializers.ModelSerializer):
    sliders = DiscoverySliderResponseSerializer(many=True, required=False)
    emotions = DiscoveryEmotionSerializer(many=True, required=False)
    competitors = DiscoveryCompetitorSerializer(many=True, required=False)
    visual_styles = DiscoveryVisualStyleSerializer(many=True, required=False)

    class Meta:
        model = ProjectDiscovery
        fields = [
            "id",
            "what_business_does",
            "target_customer",
            "why_choose_us",
            "brand_feeling",
            "audience_archetype",
            "sliders",
            "emotions",
            "competitors",
            "visual_styles",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class DiscoverySummarySerializer(serializers.Serializer):
    company_name = serializers.CharField(allow_blank=True)
    client_name = serializers.CharField(allow_blank=True)
    industry = serializers.CharField(allow_blank=True)
    target_customer = serializers.CharField(allow_blank=True)
    what_business_does = serializers.CharField(allow_blank=True)
    why_choose_us = serializers.CharField(allow_blank=True)
    brand_feeling = serializers.CharField(allow_blank=True)
    audience_archetype = serializers.CharField(allow_blank=True)
    emotions = serializers.ListField(child=serializers.CharField())
    visual_styles = serializers.ListField(child=serializers.CharField())
    top_competitors = serializers.ListField(
        child=serializers.DictField(child=serializers.CharField())
    )


class BrandDNASerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandDNA
        fields = [
            "id",
            "brand_personality_cluster",
            "business_summary",
            "target_audience_summary",
            "positioning_summary",
            "brand_feeling_summary",
            "visual_direction_summary",
            "competitor_summary",
            "generated_from_discovery",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ClientPortalBrandDNASerializer(serializers.ModelSerializer):
    class Meta:
        model = BrandDNA
        fields = [
            "brand_personality_cluster",
            "business_summary",
            "target_audience_summary",
            "positioning_summary",
            "brand_feeling_summary",
            "visual_direction_summary",
            "competitor_summary",
            "generated_from_discovery",
            "updated_at",
        ]


class MoodboardSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Moodboard
        fields = [
            "id",
            "title",
            "description",
            "image",
            "image_url",
            "is_selected",
            "created_at",
        ]
        read_only_fields = ["id", "image_url", "is_selected", "created_at"]

    def get_image_url(self, obj):
        if not obj.image:
            return ""

        request = self.context.get("request")
        image_url = obj.image.url

        return request.build_absolute_uri(image_url) if request else image_url


class ClientPortalMoodboardSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Moodboard
        fields = [
            "id",
            "title",
            "description",
            "image_url",
            "is_selected",
            "created_at",
        ]

    def get_image_url(self, obj):
        if not obj.image:
            return ""

        request = self.context.get("request")
        image_url = obj.image.url

        return request.build_absolute_uri(image_url) if request else image_url


class ClientPortalProjectSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="id", read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_email = serializers.EmailField(source="client.email", read_only=True)

    class Meta:
        model = Project
        fields = [
            "project_id",
            "company_name",
            "client_name",
            "client_email",
            "sector",
            "status",
        ]


class ProjectActivitySerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="project.id", read_only=True)
    project_name = serializers.CharField(source="project.company_name", read_only=True)

    class Meta:
        model = ProjectActivity
        fields = [
            "id",
            "project_id",
            "project_name",
            "actor_type",
            "action",
            "description",
            "metadata",
            "is_read",
            "read_at",
            "created_at",
        ]
        read_only_fields = fields


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
