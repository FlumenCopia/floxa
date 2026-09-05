import os
import sys
import time

if "django" not in sys.modules:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django
    django.setup()

from django.contrib.auth import get_user_model
from django.db import connection, reset_queries
from django.test import override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from projects.models import (
    Client,
    ClientProfile,
    Concept,
    Deliverable,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectAgreement,
    ProjectDiscovery,
)
from projects.views import ProjectListCreateView

User = get_user_model()


def setup_benchmark_fixtures(num_projects=100):
    user, _ = User.objects.get_or_create(
        email="bench_consultant@example.com",
        defaults={"name": "Bench Consultant", "password": "password123"}
    )
    # Clean old bench data
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

    # Add related objects to simulate varied workflow stages
    # e.g. 20% created, 20% discovery, 20% moodboards, 20% concepts, 20% delivered
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


def run_benchmark(user, query_params=None):
    factory = APIRequestFactory()
    view = ProjectListCreateView.as_view()

    params = query_params or {}
    request = factory.get("/api/projects/", params, HTTP_HOST="127.0.0.1")
    force_authenticate(request, user=user)

    reset_queries()
    start_time = time.perf_counter()
    with override_settings(DEBUG=True):
        response = view(request)
    duration_ms = (time.perf_counter() - start_time) * 1000
    query_count = len(connection.queries)

    return {
        "status_code": response.status_code,
        "count": response.data.get("count"),
        "results_count": len(response.data.get("results", [])),
        "query_count": query_count,
        "duration_ms": duration_ms,
    }


if __name__ == "__main__":
    for size in [10, 100, 500]:
        print(f"\n--- Setting up {size} projects ---")
        user = setup_benchmark_fixtures(size)

        # Benchmark 1: No filter (page 1)
        res_nofilter = run_benchmark(user, {"page": "1", "page_size": "10"})
        print(f"[{size} projects] No filter: {res_nofilter['duration_ms']:.2f}ms, {res_nofilter['query_count']} queries, count={res_nofilter['count']}, results={res_nofilter['results_count']}")

        # Benchmark 2: With status filter (page 1)
        res_status = run_benchmark(user, {"status": "discovery", "page": "1", "page_size": "10"})
        print(f"[{size} projects] Status=discovery: {res_status['duration_ms']:.2f}ms, {res_status['query_count']} queries, count={res_status['count']}, results={res_status['results_count']}")

        # Benchmark 3: With search
        res_search = run_benchmark(user, {"search": "Bench", "page": "1", "page_size": "10"})
        print(f"[{size} projects] Search=Bench: {res_search['duration_ms']:.2f}ms, {res_search['query_count']} queries, count={res_search['count']}, results={res_search['results_count']}")
