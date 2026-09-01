import time
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.db import connection
from django.urls import reverse
from rest_framework.test import APIClient

from projects.models import (
    Client,
    Project,
    ClientProfile,
    ProjectDiscovery,
    DiscoverySliderResponse,
    DiscoveryEmotion,
    DiscoveryCompetitor,
    DiscoveryVisualStyle,
    Moodboard,
    Concept,
    Deliverable,
    ProjectAgreement,
    PaymentMilestone,
    ProjectActivity,
)

User = get_user_model()


class Phase3PerformanceInvestigationTests(TestCase):
    """
    Dedicated test suite for Phase 3:
    Profiles database query counts, N+1 query patterns, and response latencies
    across core consultant and client portal endpoints.
    """

    def setUp(self):
        self.client = APIClient()
        self.consultant = User.objects.create_user(
            email="perf_consultant@floxa.test",
            name="Alice Performance",
            password="StrongPassword123!",
        )
        self.client.force_authenticate(user=self.consultant)

    def create_synthetic_project(self, index):
        client = Client.objects.create(
            name=f"Client {index}",
            email=f"client{index}@perf.test",
            company_name=f"Company {index}",
            sector="Technology",
        )
        project = Project.objects.create(
            consultant=self.consultant,
            client=client,
            title=f"Project {index}",
            company_name=f"Company {index}",
            sector="Technology",
            project_value=Decimal("100000.00"),
            portal_token=uuid.uuid4(),
            status=Project.Status.CREATED,
        )
        ClientProfile.objects.create(
            project=project,
            client_name=f"Client {index}",
            company_name=f"Company {index}",
            industry="Technology",
            location="San Francisco, CA",
            phone="1234567890",
        )
        discovery = ProjectDiscovery.objects.create(
            project=project,
            what_business_does=f"Business description for project {index}",
            target_customer="Enterprise buyers",
            why_choose_us="High quality",
            brand_feeling="Modern",
            audience_archetype="The Creator",
        )
        DiscoverySliderResponse.objects.create(discovery=discovery, slider_key="modern_classic", value=80)
        DiscoveryEmotion.objects.create(discovery=discovery, emotion="Innovative")
        DiscoveryCompetitor.objects.create(discovery=discovery, name=f"Competitor {index}")
        DiscoveryVisualStyle.objects.create(discovery=discovery, style="Minimal")

        PaymentMilestone.objects.create(project=project, type=PaymentMilestone.Type.ADVANCE, percentage=50, status=PaymentMilestone.Status.PAID)
        PaymentMilestone.objects.create(project=project, type=PaymentMilestone.Type.MID, percentage=25, status=PaymentMilestone.Status.READY)
        PaymentMilestone.objects.create(project=project, type=PaymentMilestone.Type.FINAL, percentage=25, status=PaymentMilestone.Status.LOCKED)

        ProjectActivity.objects.create(
            project=project,
            consultant=self.consultant,
            actor_type=ProjectActivity.ActorType.SYSTEM,
            action="project_created",
            description=f"Project {index} was created.",
        )
        return project

    def test_01_project_list_query_efficiency_and_n_plus_one_avoidance(self):
        """Verify that fetching the project list does not trigger N+1 queries as project count grows."""
        # 1. Create 5 projects
        for i in range(5):
            self.create_synthetic_project(i)

        with CaptureQueriesContext(connection) as queries_5:
            t0 = time.perf_counter()
            res_5 = self.client.get(reverse("project-list-create"))
            t_5 = (time.perf_counter() - t0) * 1000
            self.assertEqual(res_5.status_code, 200)

        query_count_5 = len(queries_5)

        # 2. Add 15 more projects (total 20 projects)
        for i in range(5, 20):
            self.create_synthetic_project(i)

        with CaptureQueriesContext(connection) as queries_20:
            t0 = time.perf_counter()
            res_20 = self.client.get(reverse("project-list-create"))
            t_20 = (time.perf_counter() - t0) * 1000
            self.assertEqual(res_20.status_code, 200)

        query_count_20 = len(queries_20)

        # Confirm query count is bounded by prefetching and does not grow linearly with project count
        self.assertLessEqual(query_count_20, query_count_5 + 3, f"Possible N+1 query leak detected: {query_count_5} queries for 5 projects vs {query_count_20} for 20 projects")
        self.assertLess(t_20, 300, f"Project list latency too high: {t_20:.2f}ms")

    def test_02_analytics_endpoint_performance_and_aggregations(self):
        """Verify analytics endpoint performs database-level aggregations without N+1 queries."""
        for i in range(10):
            self.create_synthetic_project(i)

        with CaptureQueriesContext(connection) as queries:
            t0 = time.perf_counter()
            res = self.client.get(reverse("project-analytics"))
            t_analytics = (time.perf_counter() - t0) * 1000
            self.assertEqual(res.status_code, 200)

        query_count = len(queries)
        self.assertIn("total_paid_revenue", res.data)
        self.assertIn("average_project_progress", res.data)
        # Analytics should execute a fixed set of aggregation and prefetch queries (under 25 total)
        self.assertLessEqual(query_count, 25, f"Analytics query count is excessive: {query_count} queries")
        self.assertLess(t_analytics, 250, f"Analytics response latency too high: {t_analytics:.2f}ms")

    def test_03_activity_feed_polling_performance(self):
        """Verify the consultant activity feed (polled every 30s) executes fast bounded queries."""
        for i in range(10):
            self.create_synthetic_project(i)

        with CaptureQueriesContext(connection) as queries:
            t0 = time.perf_counter()
            res = self.client.get(reverse("consultant-activities"))
            t_activities = (time.perf_counter() - t0) * 1000
            self.assertEqual(res.status_code, 200)

        query_count = len(queries)
        # Activity list query should be a single indexed SELECT with project select_related
        self.assertLessEqual(query_count, 5, f"Activities query count too high: {query_count}")
        self.assertLess(t_activities, 100, f"Activities polling response time too high: {t_activities:.2f}ms")
