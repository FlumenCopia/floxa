import os
import sys
import time

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, reset_queries
from django.db.models import Case, CharField, Exists, OuterRef, Q, Value, When
from django.test import override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from projects.models import (
    Agreement,
    BrandDNA,
    Client,
    ClientProfile,
    Concept,
    Deliverable,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoveryVisualStyle,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectAgreement,
    ProjectDiscovery,
)
from projects.progress import calculate_project_workflow_status
from projects.serializers import ProjectSerializer
from projects.views import (
    PROJECT_WORKFLOW_STATUS_FILTERS,
    ProjectListCreateView,
    ProjectPagination,
)

User = get_user_model()


def get_workflow_status_annotation():
    has_final_paid = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.FINAL,
            status=PaymentMilestone.Status.PAID,
        )
    )
    has_shared_deliverable = Exists(
        Deliverable.objects.filter(
            project=OuterRef("pk"),
            status=Deliverable.Status.SHARED,
        )
    )
    has_agreement = Exists(
        ProjectAgreement.objects.filter(project=OuterRef("pk"))
    ) | Exists(
        Agreement.objects.filter(project=OuterRef("pk"))
    )
    has_shared_or_approved_concept = Exists(
        Concept.objects.filter(
            project=OuterRef("pk"),
            status__in=[Concept.Status.SHARED, Concept.Status.APPROVED],
        )
    )
    has_moodboard = Exists(
        Moodboard.objects.filter(project=OuterRef("pk"))
    )
    has_brand_dna = Exists(
        BrandDNA.objects.filter(project=OuterRef("pk"))
    )
    has_advance_paid = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.ADVANCE,
            status=PaymentMilestone.Status.PAID,
        )
    )
    has_advance_ready = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.ADVANCE,
            status__in=[
                PaymentMilestone.Status.READY,
                PaymentMilestone.Status.REQUESTED,
            ],
        )
    )
    has_client_profile = Exists(
        ClientProfile.objects.filter(project=OuterRef("pk"))
    )
    complete_discovery_q = (
        Q(discovery__isnull=False)
        & ~Q(discovery__what_business_does__isnull=True) & ~Q(discovery__what_business_does="")
        & ~Q(discovery__target_customer__isnull=True) & ~Q(discovery__target_customer="")
        & ~Q(discovery__why_choose_us__isnull=True) & ~Q(discovery__why_choose_us="")
        & ~Q(discovery__brand_feeling__isnull=True) & ~Q(discovery__brand_feeling="")
        & ~Q(discovery__audience_archetype__isnull=True) & ~Q(discovery__audience_archetype="")
        & Q(has_emotions_sub=True)
        & Q(has_competitors_sub=True)
        & Q(has_visual_styles_sub=True)
    )

    return Case(
        When(Q(client_signed_off=True) | Q(status=Project.Status.DELIVERED), then=Value("delivered")),
        When(has_final_paid, then=Value("final_paid")),
        When(has_shared_deliverable, then=Value("deliverables")),
        When(has_agreement, then=Value("agreement")),
        When(has_shared_or_approved_concept, then=Value("concepts")),
        When(has_moodboard, then=Value("moodboards")),
        When(has_brand_dna, then=Value("brand_dna")),
        When(has_advance_paid, then=Value("advance_paid")),
        When(has_advance_ready, then=Value("advance_payment")),
        When(has_client_profile | complete_discovery_q, then=Value("discovery")),
        default=Value("created"),
        output_field=CharField(),
    )


def original_get(user, params):
    factory = APIRequestFactory()
    request = factory.get("/api/projects/", params, HTTP_HOST="127.0.0.1")
    request.user = user
    force_authenticate(request, user=user)

    reset_queries()
    start_time = time.perf_counter()
    with override_settings(DEBUG=True):
        projects = Project.objects.filter(
            consultant=request.user,
            is_archived=False,
        ).select_related("client")

        search = params.get("search", "").strip() if isinstance(params, dict) else ""
        if search:
            projects = projects.filter(
                Q(title__icontains=search)
                | Q(company_name__icontains=search)
                | Q(sector__icontains=search)
                | Q(status__icontains=search)
                | Q(client__name__icontains=search)
                | Q(client__email__icontains=search)
            )

        workflow_status = params.get("status", "").strip() if isinstance(params, dict) else ""
        projects = projects.order_by("-created_at").select_related(
            "client_profile",
            "discovery",
            "brand_dna",
            "project_agreement",
            "agreement",
        ).prefetch_related(
            "discovery__emotions",
            "discovery__competitors",
            "discovery__visual_styles",
            "moodboards",
            "concepts",
            "deliverables",
            "payment_milestones",
        )

        if workflow_status:
            if workflow_status in PROJECT_WORKFLOW_STATUS_FILTERS:
                projects = [
                    project
                    for project in projects
                    if calculate_project_workflow_status(project) == workflow_status
                ]
            else:
                projects = projects.none()

        paginator = ProjectPagination()
        paginated_projects = paginator.paginate_queryset(projects, request)
        serializer = ProjectSerializer(paginated_projects, many=True)
        response = paginator.get_paginated_response(serializer.data)

    duration_ms = (time.perf_counter() - start_time) * 1000
    return {
        "count": response.data.get("count"),
        "results": [p["id"] for p in response.data.get("results", [])],
        "query_count": len(connection.queries),
        "duration_ms": duration_ms,
    }


def optimized_get(user, params):
    factory = APIRequestFactory()
    request = factory.get("/api/projects/", params, HTTP_HOST="127.0.0.1")
    request.user = user
    force_authenticate(request, user=user)

    reset_queries()
    start_time = time.perf_counter()
    with override_settings(DEBUG=True):
        projects = Project.objects.filter(
            consultant=request.user,
            is_archived=False,
        ).select_related("client")

        search = params.get("search", "").strip() if isinstance(params, dict) else ""
        if search:
            projects = projects.filter(
                Q(title__icontains=search)
                | Q(company_name__icontains=search)
                | Q(sector__icontains=search)
                | Q(status__icontains=search)
                | Q(client__name__icontains=search)
                | Q(client__email__icontains=search)
            )

        workflow_status = params.get("status", "").strip() if isinstance(params, dict) else ""

        if workflow_status:
            if workflow_status in PROJECT_WORKFLOW_STATUS_FILTERS:
                projects = projects.annotate(
                    has_emotions_sub=Exists(DiscoveryEmotion.objects.filter(discovery__project=OuterRef("pk"))),
                    has_competitors_sub=Exists(DiscoveryCompetitor.objects.filter(discovery__project=OuterRef("pk"))),
                    has_visual_styles_sub=Exists(DiscoveryVisualStyle.objects.filter(discovery__project=OuterRef("pk"))),
                    annotated_workflow_status=get_workflow_status_annotation(),
                ).filter(annotated_workflow_status=workflow_status)
            else:
                projects = projects.none()

        projects = projects.order_by("-created_at").select_related(
            "client_profile",
            "discovery",
            "brand_dna",
            "project_agreement",
            "agreement",
        ).prefetch_related(
            "discovery__emotions",
            "discovery__competitors",
            "discovery__visual_styles",
            "moodboards",
            "concepts",
            "deliverables",
            "payment_milestones",
        )

        paginator = ProjectPagination()
        paginated_projects = paginator.paginate_queryset(projects, request)
        serializer = ProjectSerializer(paginated_projects, many=True)
        response = paginator.get_paginated_response(serializer.data)

    duration_ms = (time.perf_counter() - start_time) * 1000
    return {
        "count": response.data.get("count"),
        "results": [p["id"] for p in response.data.get("results", [])],
        "query_count": len(connection.queries),
        "duration_ms": duration_ms,
    }


def setup_benchmark_fixtures(num_projects=100):
    user, _ = User.objects.get_or_create(
        email="bench_consultant@example.com",
        defaults={"name": "Bench Consultant", "password": "password123"}
    )
    Project.objects.filter(consultant=user).delete()
    Client.objects.filter(email__startswith="bench_client_").delete()

    clients = [
        Client(
            name=f"Bench Client {i}",
            email=f"bench_client_{i}@example.com",
            company_name=f"Bench Co {i}",
            sector="Tech"
        )
        for i in range(num_projects)
    ]
    Client.objects.bulk_create(clients)
    created_clients = list(Client.objects.filter(email__startswith="bench_client_").order_by("id"))

    projects = [
        Project(
            title=f"Bench Project {i}",
            consultant=user,
            client=created_clients[i],
            company_name=f"Bench Co {i}",
            sector="Tech",
            portal_password_hash="pbkdf2_sha256$test",
        )
        for i in range(num_projects)
    ]
    Project.objects.bulk_create(projects)
    created_projects = list(Project.objects.filter(consultant=user).order_by("id"))

    profiles = []
    moodboards = []
    concepts = []
    for i, proj in enumerate(created_projects):
        mod = i % 5
        if mod == 1:  # discovery
            profiles.append(ClientProfile(project=proj, client_name=f"Client {i}", company_name=f"Co {i}", industry="Tech"))
        elif mod == 2:  # moodboard
            moodboards.append(Moodboard(project=proj, title="Moodboard 1"))
        elif mod == 3:  # concept
            concepts.append(Concept(project=proj, title="Concept 1", status=Concept.Status.SHARED))
        elif mod == 4:  # delivered
            proj.status = Project.Status.DELIVERED
            proj.client_signed_off = True
            proj.save(update_fields=["status", "client_signed_off"])

    if profiles:
        ClientProfile.objects.bulk_create(profiles)
    if moodboards:
        Moodboard.objects.bulk_create(moodboards)
    if concepts:
        Concept.objects.bulk_create(concepts)

    return user


def run_comparative_benchmark():
    for size in [10, 100, 500]:
        print(f"\n==========================================")
        print(f"BENCHMARK DATASET SIZE: {size} PROJECTS")
        print(f"==========================================")
        user = setup_benchmark_fixtures(size)

        test_cases = [
            ("No filter (page 1)", {"page": "1", "page_size": "10"}),
            ("Status=discovery (page 1)", {"status": "discovery", "page": "1", "page_size": "10"}),
            ("Status=moodboards (page 1)", {"status": "moodboards", "page": "1", "page_size": "10"}),
            ("Status=delivered (page 1)", {"status": "delivered", "page": "1", "page_size": "10"}),
            ("Search='Bench Co 1' (page 1)", {"search": "Bench Co 1", "page": "1", "page_size": "10"}),
            ("Search + Status filter", {"search": "Bench", "status": "discovery", "page": "1", "page_size": "10"}),
            ("Pagination (page 2)", {"page": "2", "page_size": "10"}),
            ("Pagination (page 2, status=discovery)", {"status": "discovery", "page": "2", "page_size": "10"}),
        ]

        for label, params in test_cases:
            orig = original_get(user, params)
            opt = optimized_get(user, params)

            assert orig["count"] == opt["count"], f"Count mismatch for {label}: {orig['count']} vs {opt['count']}"
            assert orig["results"] == opt["results"], f"Results ID mismatch for {label}: {orig['results']} vs {opt['results']}"

            print(f"\nTest: {label}")
            print(f"  Count: {orig['count']}, Returned page items: {len(orig['results'])}")
            print(f"  ORIGINAL  : {orig['duration_ms']:6.2f} ms | {orig['query_count']:2d} queries")
            print(f"  OPTIMIZED : {opt['duration_ms']:6.2f} ms | {opt['query_count']:2d} queries")
            print(f"  ID Match  : {'EXACT MATCH' if orig['results'] == opt['results'] else 'MISMATCH'}")


if __name__ == "__main__":
    run_comparative_benchmark()
