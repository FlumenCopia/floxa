from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import (
    BrandDNA,
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
from .serializers import (
    BrandDNASerializer,
    ClientPortalBrandDNASerializer,
    ClientPortalMoodboardSerializer,
    ClientPortalProjectSerializer,
    ClientProfileSerializer,
    DiscoverySummarySerializer,
    MoodboardSerializer,
    ProjectActivitySerializer,
    ProjectCreateSerializer,
    ProjectDiscoverySerializer,
    ProjectSerializer,
)


class ProjectPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50


class ProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        projects = Project.objects.filter(
            consultant=request.user,
            is_archived=False,
        ).select_related("client")

        search = request.query_params.get("search", "").strip()

        if search:
            projects = projects.filter(
                Q(title__icontains=search)
                | Q(company_name__icontains=search)
                | Q(sector__icontains=search)
                | Q(status__icontains=search)
                | Q(client__name__icontains=search)
                | Q(client__email__icontains=search)
            )

        projects = projects.order_by("-created_at")

        paginator = ProjectPagination()
        paginated_projects = paginator.paginate_queryset(projects, request)

        serializer = ProjectSerializer(paginated_projects, many=True)

        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ProjectCreateSerializer(
            data=request.data,
            context={"request": request},
        )

        if serializer.is_valid():
            project = serializer.save()
            response_serializer = ProjectSerializer(project)

            return Response(
                response_serializer.data,
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            project = Project.objects.get(
                id=pk,
                consultant=request.user,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProjectSerializer(project)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class ClientPortalProjectView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, portal_token):
        try:
            project = Project.objects.select_related("client").get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientPortalProjectSerializer(project)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalBrandDNAView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, portal_token):
        try:
            project = Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            brand_dna = project.brand_dna
        except BrandDNA.DoesNotExist:
            return Response(
                {"detail": "Brand DNA report is not ready yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientPortalBrandDNASerializer(brand_dna)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalMoodboardView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request, portal_token):
        try:
            project = Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        moodboards = project.moodboards.order_by("-created_at")
        serializer = ClientPortalMoodboardSerializer(
            moodboards,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalMoodboardSelectView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, portal_token, moodboard_id):
        try:
            project = Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
            moodboard = project.moodboards.get(id=moodboard_id)
        except (Project.DoesNotExist, Moodboard.DoesNotExist):
            return Response(
                {"detail": "Moodboard not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        project.moodboards.update(is_selected=False)
        moodboard.is_selected = True
        moodboard.save(update_fields=["is_selected", "updated_at"])
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CLIENT,
            action="moodboard_selected",
            description=f"Client selected moodboard: {moodboard.title}",
            metadata={
                "moodboard_id": moodboard.id,
                "moodboard_title": moodboard.title,
            },
        )

        serializer = ClientPortalMoodboardSerializer(
            moodboard,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get_project(self, request, project_id):
        try:
            return Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            profile = project.client_profile
        except ClientProfile.DoesNotExist:
            return Response(
                {"detail": "Client profile not found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientProfileSerializer(profile)

        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientProfileSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        profile, _ = ClientProfile.objects.update_or_create(
            project=project,
            defaults=serializer.validated_data,
        )
        response_serializer = ClientProfileSerializer(profile)

        return Response(response_serializer.data, status=status.HTTP_200_OK)


class ProjectDiscoveryView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_project(self, request, project_id):
        portal_token = request.headers.get("X-Client-Portal-Token", "").strip()

        if not portal_token:
            return None

        try:
            project = Project.objects.get(
                id=project_id,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

        if str(project.portal_token) != portal_token:
            return None

        return project

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            discovery = (
                ProjectDiscovery.objects.prefetch_related(
                    "sliders",
                    "emotions",
                    "competitors",
                    "visual_styles",
                )
                .select_related("project")
                .get(project=project)
            )
        except ProjectDiscovery.DoesNotExist:
            return Response(
                {"detail": "Project discovery not found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProjectDiscoverySerializer(discovery)

        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProjectDiscoverySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        sliders = validated_data.pop("sliders", [])
        emotions = validated_data.pop("emotions", [])
        competitors = validated_data.pop("competitors", [])
        visual_styles = validated_data.pop("visual_styles", [])

        discovery, _ = ProjectDiscovery.objects.update_or_create(
            project=project,
            defaults=validated_data,
        )

        discovery.sliders.all().delete()
        discovery.emotions.all().delete()
        discovery.competitors.all().delete()
        discovery.visual_styles.all().delete()

        DiscoverySliderResponse.objects.bulk_create(
            [
                DiscoverySliderResponse(discovery=discovery, **slider)
                for slider in sliders
            ]
        )
        DiscoveryEmotion.objects.bulk_create(
            [
                DiscoveryEmotion(discovery=discovery, **emotion)
                for emotion in emotions
            ]
        )
        DiscoveryCompetitor.objects.bulk_create(
            [
                DiscoveryCompetitor(discovery=discovery, **competitor)
                for competitor in competitors
            ]
        )
        DiscoveryVisualStyle.objects.bulk_create(
            [
                DiscoveryVisualStyle(discovery=discovery, **visual_style)
                for visual_style in visual_styles
            ]
        )

        response_serializer = ProjectDiscoverySerializer(discovery)

        return Response(response_serializer.data, status=status.HTTP_200_OK)


class DiscoverySummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get_project(self, request, project_id):
        try:
            return Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            discovery = (
                ProjectDiscovery.objects.prefetch_related(
                    "emotions",
                    "visual_styles",
                    "competitors",
                )
                .select_related("project")
                .get(project=project)
            )
        except ProjectDiscovery.DoesNotExist:
            return Response(
                {"detail": "Project discovery summary not found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            profile = project.client_profile
        except ClientProfile.DoesNotExist:
            profile = None

        summary = {
            "company_name": profile.company_name if profile else project.company_name,
            "client_name": profile.client_name if profile else project.client.name,
            "industry": profile.industry if profile else project.sector,
            "target_customer": discovery.target_customer,
            "what_business_does": discovery.what_business_does,
            "why_choose_us": discovery.why_choose_us,
            "brand_feeling": discovery.brand_feeling,
            "audience_archetype": discovery.audience_archetype,
            "emotions": [item.emotion for item in discovery.emotions.all()],
            "visual_styles": [item.style for item in discovery.visual_styles.all()],
            "top_competitors": [
                {
                    "name": item.name,
                    "rating": item.rating,
                }
                for item in discovery.competitors.all()[:5]
            ],
        }
        serializer = DiscoverySummarySerializer(summary)

        return Response(serializer.data, status=status.HTTP_200_OK)


class MoodboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get_project(self, request, project_id):
        try:
            return Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        moodboards = project.moodboards.order_by("-created_at")
        serializer = MoodboardSerializer(
            moodboards,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = MoodboardSerializer(
            data=request.data,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        moodboard = serializer.save(project=project)
        response_serializer = MoodboardSerializer(
            moodboard,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ProjectActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        activities = project.activities.order_by("-created_at")[:50]
        serializer = ProjectActivitySerializer(activities, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ConsultantActivityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        activities = (
            ProjectActivity.objects.filter(
                consultant=request.user,
                project__is_archived=False,
            )
            .select_related("project")
            .order_by("-created_at")[:50]
        )
        serializer = ProjectActivitySerializer(activities, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ConsultantActivityMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        updated_count = ProjectActivity.objects.filter(
            consultant=request.user,
            project__is_archived=False,
            is_read=False,
        ).update(
            is_read=True,
            read_at=timezone.now(),
        )

        return Response(
            {
                "detail": "Activities marked as read.",
                "updated_count": updated_count,
            },
            status=status.HTTP_200_OK,
        )


class ProjectActivityMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        updated_count = project.activities.filter(is_read=False).update(
            is_read=True,
            read_at=timezone.now(),
        )

        return Response(
            {
                "detail": "Activities marked as read.",
                "updated_count": updated_count,
            },
            status=status.HTTP_200_OK,
        )


def format_list(items, fallback):
    return ", ".join(items) if items else fallback


def get_project_for_consultant(request, project_id):
    try:
        return Project.objects.get(
            id=project_id,
            consultant=request.user,
            is_archived=False,
        )
    except Project.DoesNotExist:
        return None


def build_brand_dna_data(project, discovery):
    try:
        profile = project.client_profile
    except ClientProfile.DoesNotExist:
        profile = None

    company_name = profile.company_name if profile and profile.company_name else project.company_name
    industry = profile.industry if profile and profile.industry else project.sector
    emotions = [item.emotion for item in discovery.emotions.all()]
    visual_styles = [item.style for item in discovery.visual_styles.all()]
    competitors = [
        f"{item.name} ({item.rating})"
        for item in discovery.competitors.all()[:5]
    ]
    archetype = discovery.audience_archetype or "Quality-focused audience"
    emotion_text = format_list(emotions, "clear, confident, and trustworthy")
    visual_text = format_list(visual_styles, "clean, intentional visual direction")
    competitor_text = format_list(competitors, "No competitor references submitted.")

    return {
        "brand_personality_cluster": archetype,
        "business_summary": (
            f"{company_name} should be presented as a focused {industry} brand. "
            f"The business is described as: {discovery.what_business_does or 'Not submitted yet.'}"
        ),
        "target_audience_summary": (
            f"The brand should speak to {discovery.target_customer or 'the target customer'}. "
            "Messaging and visuals should make the offer feel relevant, credible, and easy to choose."
        ),
        "positioning_summary": (
            f"The core reason to choose this brand is: {discovery.why_choose_us or 'Not submitted yet.'} "
            "This should become the foundation for the brand's positioning and designer brief."
        ),
        "brand_feeling_summary": (
            f"The brand should make people feel {discovery.brand_feeling or 'confident and clear'}. "
            f"Emotional cues to preserve include {emotion_text}."
        ),
        "visual_direction_summary": (
            f"Recommended visual direction: {visual_text}. "
            "This should guide moodboards, typography, color, composition, and early concepts."
        ),
        "competitor_summary": (
            f"Competitor notes: {competitor_text}. "
            "Use these references to understand the client's taste, then build a distinct direction."
        ),
        "generated_from_discovery": True,
    }


class BrandDNAView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            brand_dna = project.brand_dna
        except BrandDNA.DoesNotExist:
            return Response(
                {"detail": "Brand DNA not found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = BrandDNASerializer(brand_dna)

        return Response(serializer.data, status=status.HTTP_200_OK)


class BrandDNAGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            discovery = (
                ProjectDiscovery.objects.prefetch_related(
                    "emotions",
                    "visual_styles",
                    "competitors",
                )
                .select_related("project")
                .get(project=project)
            )
        except ProjectDiscovery.DoesNotExist:
            return Response(
                {"detail": "Project discovery not found for this project."},
                status=status.HTTP_404_NOT_FOUND,
            )

        brand_dna, _ = BrandDNA.objects.update_or_create(
            project=project,
            defaults=build_brand_dna_data(project, discovery),
        )
        serializer = BrandDNASerializer(brand_dna)

        return Response(serializer.data, status=status.HTTP_200_OK)
