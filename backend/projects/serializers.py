import secrets
import string
import uuid
from pathlib import Path
from django.contrib.auth.hashers import make_password
from rest_framework import serializers

def generate_secure_portal_password(length=14):
    allowed = "23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ"
    while True:
        password = "".join(secrets.choice(allowed) for _ in range(length))
        if (
            any(c.islower() for c in password)
            and any(c.isupper() for c in password)
            and any(c.isdigit() for c in password)
        ):
            return password
from .models import (
    Agreement,
    BrandDNA,
    Client,
    ClientProfile,
    Concept,
    Deliverable,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoverySliderResponse,
    DiscoveryVisualStyle,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectActivity,
    ProjectDiscovery,
)
from .progress import calculate_project_progress, calculate_project_workflow_status
from .upload_validation import optimize_uploaded_image, validate_upload_file
from .upload_validation import can_client_download_deliverable
from .upload_validation import optimize_uploaded_image, validate_upload_file


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

    def validate_phone(self, value):
        phone = str(value or "").strip()

        if not phone.isdigit() or len(phone) != 10:
            raise serializers.ValidationError("Phone number must be exactly 10 digits.")

        return phone


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
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "submitted_at", "created_at", "updated_at"]


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
    sliders = serializers.ListField(child=serializers.DictField(), required=False)
    discovery_updated_at = serializers.DateTimeField(required=False, allow_null=True)
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

        return f"/api/projects/{obj.project.id}/moodboards/{obj.id}/image/"

    def validate(self, attrs):
        validate_upload_file(attrs.get("image"), "moodboard_image", "image")
        if attrs.get("image"):
            optimized = optimize_uploaded_image(attrs["image"], "image")
            ext = Path(optimized.name).suffix.lower() or ".jpg"
            project = self.context.get("project")
            project_id = project.id if project else "0"
            optimized.name = f"{project_id}/{uuid.uuid4().hex}{ext}"
            attrs["image"] = optimized

        return attrs


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

        return f"/api/client-portal/{obj.project.portal_token}/moodboards/{obj.id}/image/"


class ConsultantConceptSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True, required=False, allow_null=True)
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Concept
        fields = [
            "id",
            "project",
            "title",
            "description",
            "image",
            "image_url",
            "file",
            "file_url",
            "version",
            "status",
            "client_feedback",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project",
            "image_url",
            "file_url",
            "client_feedback",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        if not obj.image:
            return ""

        return f"/api/projects/{obj.project.id}/concepts/{obj.id}/image/"

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        return f"/api/projects/{obj.project.id}/concepts/{obj.id}/file/"

    def to_representation(self, instance):
        image_url = self.get_image_url(instance)
        file_url = self.get_file_url(instance)
        return {
            "id": instance.id,
            "project": instance.project_id,
            "title": instance.title,
            "description": instance.description,
            "image": image_url,
            "image_url": image_url,
            "file": file_url,
            "file_url": file_url,
            "version": instance.version,
            "status": instance.status,
            "client_feedback": instance.client_feedback,
            "created_at": instance.created_at.isoformat() if instance.created_at else "",
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else "",
        }

    def validate(self, attrs):
        has_existing_media = self.instance and (self.instance.image or self.instance.file)

        validate_upload_file(attrs.get("image"), "concept_image", "image")
        if attrs.get("file"):
            validate_upload_file(attrs.get("file"), "concept_file", "file")

        if attrs.get("image"):
            attrs["image"] = optimize_uploaded_image(attrs["image"], "image")

        if not attrs.get("image") and not attrs.get("file") and not has_existing_media:
            raise serializers.ValidationError(
                {"image": ["Upload a preview image for this concept."]}
            )

        return attrs


class ClientPortalConceptSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Concept
        fields = [
            "id",
            "title",
            "description",
            "image",
            "image_url",
            "file",
            "file_url",
            "version",
            "status",
            "client_feedback",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        if not obj.image:
            return ""

        return f"/api/client-portal/{obj.project.portal_token}/concepts/{obj.id}/image/"

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        return f"/api/client-portal/{obj.project.portal_token}/concepts/{obj.id}/file/"

    def to_representation(self, instance):
        image_url = self.get_image_url(instance)
        file_url = self.get_file_url(instance)
        return {
            "id": instance.id,
            "title": instance.title,
            "description": instance.description,
            "image": image_url,
            "image_url": image_url,
            "file": file_url,
            "file_url": file_url,
            "version": instance.version,
            "status": instance.status,
            "client_feedback": instance.client_feedback,
            "created_at": instance.created_at.isoformat() if instance.created_at else "",
            "updated_at": instance.updated_at.isoformat() if instance.updated_at else "",
        }


class ConsultantDeliverableSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Deliverable
        fields = [
            "id",
            "project",
            "title",
            "description",
            "file",
            "file_url",
            "file_name",
            "file_size",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project",
            "file_url",
            "file_name",
            "file_size",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        return f"/api/projects/{obj.project.id}/deliverables/{obj.id}/file/"

    def get_file_name(self, obj):
        return obj.file.name.split("/")[-1] if obj.file else ""

    def get_file_size(self, obj):
        return obj.file.size if obj.file else 0

    def validate(self, attrs):
        has_existing_file = self.instance and self.instance.file

        validate_upload_file(attrs.get("file"), "deliverable_file", "file")

        if not attrs.get("file") and not has_existing_file:
            raise serializers.ValidationError(
                {"detail": "Upload a file for this deliverable."}
            )

        return attrs


class ConsultantAgreementSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Agreement
        fields = [
            "id",
            "project",
            "title",
            "file",
            "file_url",
            "file_name",
            "file_size",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project",
            "file_url",
            "file_name",
            "file_size",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        return f"/api/projects/{obj.project.id}/agreement/{obj.id}/file/"

    def get_file_name(self, obj):
        return obj.file.name.split("/")[-1] if obj.file else ""

    def get_file_size(self, obj):
        try:
            return obj.file.size if obj.file else 0
        except Exception:
            return 0

    def validate(self, attrs):
        has_existing_file = self.instance and self.instance.file

        validate_upload_file(attrs.get("file"), "agreement_file", "file")

        if not attrs.get("file") and not has_existing_file:
            raise serializers.ValidationError(
                {"detail": "Upload a file for this agreement."}
            )

        return attrs


class ClientPortalAgreementSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Agreement
        fields = [
            "title",
            "file_url",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        if not obj.file:
            return ""

        return f"/api/client-portal/{obj.project.portal_token}/agreement/file/"


class ClientPortalDeliverableSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    can_download = serializers.SerializerMethodField()
    download_locked_reason = serializers.SerializerMethodField()

    class Meta:
        model = Deliverable
        fields = [
            "id",
            "title",
            "description",
            "file_url",
            "file_name",
            "file_size",
            "status",
            "can_download",
            "download_locked_reason",
            "created_at",
            "updated_at",
        ]

    def get_can_download(self, obj):
        can_download, _ = can_client_download_deliverable(obj.project, obj)
        return can_download

    def get_download_locked_reason(self, obj):
        _, reason = can_client_download_deliverable(obj.project, obj)
        return reason

    def get_file_url(self, obj):
        if not obj.file:
            return None

        can_download, _ = can_client_download_deliverable(obj.project, obj)
        if not can_download:
            return None

        return f"/api/client-portal/{obj.project.portal_token}/deliverables/{obj.id}/file/"

    def get_file_name(self, obj):
        return obj.file.name.split("/")[-1] if obj.file else ""

    def get_file_size(self, obj):
        return obj.file.size if obj.file else 0


class ClientPortalProjectSerializer(serializers.ModelSerializer):
    project_id = serializers.IntegerField(source="id", read_only=True)
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_email = serializers.EmailField(source="client.email", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "project_id",
            "company_name",
            "client_name",
            "client_email",
            "sector",
            "status",
            "progress",
            "client_signed_off",
            "signed_off_at",
        ]

    def get_progress(self, obj):
        return calculate_project_progress(obj)


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


class ClientPortalActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectActivity
        fields = [
            "id",
            "action",
            "description",
            "metadata",
            "client_is_read",
            "client_read_at",
            "created_at",
        ]
        read_only_fields = fields


class PaymentMilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMilestone
        fields = [
            "id",
            "project",
            "type",
            "percentage",
            "amount",
            "status",
            "requested_at",
            "paid_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ClientPortalPaymentMilestoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMilestone
        fields = [
            "id",
            "type",
            "percentage",
            "amount",
            "status",
            "requested_at",
            "paid_at",
        ]
        read_only_fields = fields


class ProjectSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)
    client_email = serializers.EmailField(source="client.email", read_only=True)
    progress = serializers.SerializerMethodField()
    workflow_status = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "id",
            "title",
            "company_name",
            "sector",
            "status",
            "workflow_status",
            "project_value",
            "advance_percentage",
            "mid_percentage",
            "final_percentage",
            "revision_limit",
            "portal_token",
            "progress",
            "client_signed_off",
            "signed_off_at",
            "is_archived",
            "client_name",
            "client_email",
            "created_at",
            "updated_at",
        ]

    def get_progress(self, obj):
        return calculate_project_progress(obj)

    def get_workflow_status(self, obj):
        return calculate_project_workflow_status(obj)


class ProjectCreateSerializer(serializers.Serializer):
    client = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    company = serializers.CharField(max_length=255)
    sector = serializers.CharField(max_length=100)
    value = serializers.DecimalField(max_digits=12, decimal_places=2)
    portal_password = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    advance = serializers.IntegerField(required=False, default=50, min_value=0, max_value=100)
    mid = serializers.IntegerField(required=False, default=25, min_value=0, max_value=100)
    final = serializers.IntegerField(required=False, default=25, min_value=0, max_value=100)
    revisions = serializers.CharField(max_length=50, required=False, allow_blank=True, default="3 revisions")

    def validate_portal_password(self, value):
        if value and len(value.strip()) > 0 and len(value.strip()) < 6:
            raise serializers.ValidationError("Portal password must be at least 6 characters.")
        return value

    def validate_value(self, value):
        if value <= 0:
            raise serializers.ValidationError("Project value must be a positive amount.")

        return value

    def validate(self, attrs):
        total = attrs.get("advance", 50) + attrs.get("mid", 25) + attrs.get("final", 25)

        if total != 100:
            raise serializers.ValidationError(
                {"payment_split": "Advance, mid, and final payment percentages must total 100%."}
            )

        return attrs

    def create(self, validated_data):
        consultant = self.context["request"].user

        client = Client.objects.create(
            name=validated_data["client"],
            email=validated_data["email"],
            company_name=validated_data["company"],
            sector=validated_data["sector"],
        )

        custom_password = (validated_data.get("portal_password") or "").strip()
        raw_portal_password = custom_password if custom_password else generate_secure_portal_password()

        project = Project.objects.create(
            consultant=consultant,
            client=client,
            title=validated_data["company"],
            company_name=validated_data["company"],
            sector=validated_data["sector"],
            project_value=validated_data["value"],
            portal_password_hash=make_password(raw_portal_password),
            advance_percentage=validated_data["advance"],
            mid_percentage=validated_data["mid"],
            final_percentage=validated_data["final"],
            revision_limit=validated_data["revisions"] or "3 revisions",
            status=Project.Status.CREATED,
            progress=5,
        )

        project._raw_portal_password = raw_portal_password
        return project

