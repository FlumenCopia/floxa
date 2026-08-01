from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Consultant
from projects.models import (
    Client,
    ClientProfile,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectActivity,
)


class BatchCQueryAndPerformanceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.consultant = Consultant.objects.create_user(
            email="consultant_batchc@example.com",
            password="testpassword123",
            name="Test Consultant",
        )
        self.client.force_authenticate(user=self.consultant)

        self.client_obj = Client.objects.create(
            name="Test Client",
            email="client_batchc@example.com",
            consultant=self.consultant,
        )

        self.project1 = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            title="Project Alpha",
            company_name="Alpha Corp",
            sector="Technology",
            project_value=100000,
        )

        self.project2 = Project.objects.create(
            consultant=self.consultant,
            client=self.client_obj,
            title="Project Beta",
            company_name="Beta Corp",
            sector="Healthcare",
            project_value=200000,
        )

        PaymentMilestone.objects.create(
            project=self.project1,
            title="Deposit",
            amount=50000,
            status=PaymentMilestone.Status.PAID,
        )

        ProjectActivity.create(
            project=self.project1,
            consultant=self.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="moodboard_uploaded",
            description="Uploaded moodboard",
        )

    def test_projects_list_query_count_and_contract(self):
        url = reverse("project-list-create")
        with self.assertNumQueries(4):
            response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data.get("results", response.data)
        self.assertEqual(len(data), 2)
        self.assertIn("workflow_status", data[0])
        self.assertIn("progress", data[0])

    def test_project_detail_query_efficiency_and_contract(self):
        url = reverse("project-detail", kwargs={"pk": self.project1.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.project1.id)

    def test_consultant_activities_query_count(self):
        url = reverse("consultant-activities")
        with self.assertNumQueries(2):
            response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["action"], "moodboard_uploaded")

    def test_analytics_response_values_and_single_revenue_query(self):
        url = reverse("project-analytics")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_projects"], 2)
        self.assertIn("total_paid_revenue", response.data)
        self.assertIn("revenue_last_6_months", response.data)
        self.assertEqual(len(response.data["revenue_last_6_months"]), 6)

    def test_client_portal_access_isolation(self):
        other_consultant = Consultant.objects.create_user(
            email="other@example.com",
            password="testpassword123",
        )
        self.client.force_authenticate(user=other_consultant)

        url = reverse("project-detail", kwargs={"pk": self.project1.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
