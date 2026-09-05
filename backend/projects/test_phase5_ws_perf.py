import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db import connection, reset_queries
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from channels.testing import WebsocketCommunicator

from config.asgi import application
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
from projects.progress import calculate_project_workflow_status, get_workflow_status_annotation
from projects.views import PORTAL_ACCESS_COOKIE_NAME, sign_portal_access_token

User = get_user_model()


@override_settings(DEBUG=True)
class Phase5WebSocketAndPerformanceTests(TestCase):
    def setUp(self):
        self.consultant_a = User.objects.create_user(
            email="consultant_a_p5@example.com",
            password="password123",
            name="Consultant A",
        )
        self.consultant_b = User.objects.create_user(
            email="consultant_b_p5@example.com",
            password="password123",
            name="Consultant B",
        )
        self.jwt_a = str(RefreshToken.for_user(self.consultant_a).access_token)
        self.jwt_b = str(RefreshToken.for_user(self.consultant_b).access_token)

        self.client_a = Client.objects.create(
            name="Client A",
            email="client_a_p5@example.com",
            company_name="Acme Alpha",
            sector="Design",
        )
        self.client_b = Client.objects.create(
            name="Client B",
            email="client_b_p5@example.com",
            company_name="Beta Corp",
            sector="Finance",
        )

        self.project_a = Project.objects.create(
            title="Alpha Project",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Acme Alpha",
            sector="Design",
            portal_password_hash="pbkdf2_sha256$testpass",
        )
        self.project_b = Project.objects.create(
            title="Beta Project",
            consultant=self.consultant_b,
            client=self.client_b,
            company_name="Beta Corp",
            sector="Finance",
            portal_password_hash="pbkdf2_sha256$testpass",
        )

        self.api_consultant_a = APIClient()
        self.api_consultant_a.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jwt_a}")

        self.api_consultant_b = APIClient()
        self.api_consultant_b.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jwt_b}")

        self.client_a_api = APIClient()
        self.client_a_api.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(self.project_a.portal_token)
        self.client_a_headers = {"HTTP_X_CLIENT_PORTAL_TOKEN": str(self.project_a.portal_token)}

    # =========================================================================
    # PART A: ROUTE-WS-001 (WebSocket Routing, Auth, Reconnect & WebRTC)
    # =========================================================================

    async def test_ws_canonical_consultant_route_authenticated(self):
        """Canonical route /ws/support/consultant/?token=... accepts authenticated consultant."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        ready_msg = await communicator.receive_json_from(timeout=5)
        self.assertEqual(ready_msg.get("type"), "CONSULTANT_READY")
        self.assertEqual(ready_msg.get("consultant_id"), self.consultant_a.id)
        await communicator.disconnect()

    async def test_ws_consultant_route_anonymous_rejected(self):
        """Anonymous connection to /ws/support/consultant/ without token is rejected with ERROR and closed with 4001."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/support/consultant/",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        err_msg = await communicator.receive_json_from(timeout=5)
        self.assertEqual(err_msg.get("type"), "ERROR")
        close_event = await communicator.receive_output(timeout=5)
        self.assertEqual(close_event.get("type"), "websocket.close")
        self.assertEqual(close_event.get("code"), 4001)

    async def test_ws_consultant_route_invalid_token_rejected(self):
        """Connection to /ws/support/consultant/ with invalid token is rejected with ERROR and closed with 4001."""
        communicator = WebsocketCommunicator(
            application,
            "/ws/support/consultant/?token=invalid_garbage_token_12345",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        err_msg = await communicator.receive_json_from(timeout=5)
        self.assertEqual(err_msg.get("type"), "ERROR")
        close_event = await communicator.receive_output(timeout=5)
        self.assertEqual(close_event.get("type"), "websocket.close")
        self.assertEqual(close_event.get("code"), 4001)

    async def test_ws_consultant_route_expired_token_rejected(self):
        """Connection to /ws/support/consultant/ with expired JWT token is rejected with ERROR and closed with 4001."""
        token = AccessToken.for_user(self.consultant_a)
        token.set_exp(lifetime=-timedelta(minutes=10))
        expired_jwt = str(token)

        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={expired_jwt}",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        err_msg = await communicator.receive_json_from(timeout=5)
        self.assertEqual(err_msg.get("type"), "ERROR")
        close_event = await communicator.receive_output(timeout=5)
        self.assertEqual(close_event.get("type"), "websocket.close")
        self.assertEqual(close_event.get("code"), 4001)

    async def test_ws_consultant_reconnect_cleanly_without_duplicate_listeners(self):
        """Authorized consultant disconnects and reconnects without duplicate listeners or double broadcasts."""
        # 1. First connection
        ws_1 = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}",
        )
        c1, _ = await ws_1.connect()
        self.assertTrue(c1)
        init_1 = await ws_1.receive_json_from(timeout=5)
        self.assertEqual(init_1.get("type"), "CONSULTANT_READY")
        await ws_1.disconnect()

        # 2. Reconnect
        ws_2 = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}",
        )
        c2, _ = await ws_2.connect()
        self.assertTrue(c2)
        init_2 = await ws_2.receive_json_from(timeout=5)
        self.assertEqual(init_2.get("type"), "CONSULTANT_READY")

        # 3. Trigger client help request
        signed_cookie = sign_portal_access_token(self.project_a.portal_token)
        client_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/",
            headers=[(b"cookie", f"{PORTAL_ACCESS_COOKIE_NAME}={signed_cookie}".encode("ascii"))],
        )
        cc, _ = await client_ws.connect()
        self.assertTrue(cc)
        await client_ws.receive_json_from(timeout=5)  # INITIAL_STATE

        await client_ws.send_json_to({
            "type": "CLIENT_REQUEST_HELP",
            "page_id": "discovery",
            "field_key": "what_business_does",
            "question": "Need help here",
        })

        # ws_2 receives exactly one help request notification
        msg = await ws_2.receive_json_from(timeout=5)
        self.assertEqual(msg.get("type"), "NOTIFICATION_HELP_REQUESTED")
        self.assertEqual(msg.get("project_id"), self.project_a.id)

        # No duplicate frame received
        nothing = await ws_2.receive_nothing(timeout=1)
        self.assertTrue(nothing)

        await client_ws.disconnect()
        await ws_2.disconnect()

    async def test_ws_help_request_isolation_between_consultants(self):
        """Help request from Client A reaches only Consultant A, never Consultant B."""
        ws_consultant_a = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_a}",
        )
        connected_a, _ = await ws_consultant_a.connect()
        self.assertTrue(connected_a)
        init_a = await ws_consultant_a.receive_json_from(timeout=5)
        self.assertEqual(init_a.get("type"), "CONSULTANT_READY")

        ws_consultant_b = WebsocketCommunicator(
            application,
            f"/ws/support/consultant/?token={self.jwt_b}",
        )
        connected_b, _ = await ws_consultant_b.connect()
        self.assertTrue(connected_b)
        init_b = await ws_consultant_b.receive_json_from(timeout=5)
        self.assertEqual(init_b.get("type"), "CONSULTANT_READY")

        # Connect Client A to support room
        signed_cookie = sign_portal_access_token(self.project_a.portal_token)
        client_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/",
            headers=[(b"cookie", f"{PORTAL_ACCESS_COOKIE_NAME}={signed_cookie}".encode("ascii"))],
        )
        c_connected, _ = await client_ws.connect()
        self.assertTrue(c_connected)
        c_init = await client_ws.receive_json_from(timeout=5)
        self.assertEqual(c_init.get("type"), "INITIAL_STATE")

        # Client A sends CLIENT_REQUEST_HELP via websocket
        await client_ws.send_json_to({
            "type": "CLIENT_REQUEST_HELP",
            "page_id": "brand_dna",
            "field_key": "personality",
            "question": "Need assistance with DNA",
        })

        # Consultant A receives the help notification frame
        msg_a = await ws_consultant_a.receive_json_from(timeout=5)
        self.assertEqual(msg_a.get("type"), "NOTIFICATION_HELP_REQUESTED")
        self.assertEqual(msg_a.get("project_id"), self.project_a.id)
        self.assertEqual(msg_a.get("page_id"), "brand_dna")

        # Consultant B receives nothing
        nothing_for_b = await ws_consultant_b.receive_nothing(timeout=1)
        self.assertTrue(nothing_for_b)

        await client_ws.disconnect()
        await ws_consultant_a.disconnect()
        await ws_consultant_b.disconnect()

    async def test_ws_support_room_unauthorized_consultant_rejected(self):
        """Consultant B cannot join Project A's support room (closed with code 4003)."""
        communicator = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/?consultant_token={self.jwt_b}",
        )
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        err_msg = await communicator.receive_json_from(timeout=5)
        self.assertEqual(err_msg.get("type"), "ERROR")
        self.assertEqual(err_msg.get("message"), "Permission denied")
        close_event = await communicator.receive_output(timeout=5)
        self.assertEqual(close_event.get("type"), "websocket.close")
        self.assertEqual(close_event.get("code"), 4003)

    async def test_ws_field_sync_and_signaling_between_client_and_consultant(self):
        """FIELD_SYNC messages are properly delivered between authorized client and consultant."""
        signed_cookie = sign_portal_access_token(self.project_a.portal_token)
        headers = [(b"cookie", f"{PORTAL_ACCESS_COOKIE_NAME}={signed_cookie}".encode("ascii"))]

        client_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/",
            headers=headers,
        )
        c_connected, _ = await client_ws.connect()
        self.assertTrue(c_connected)
        c_init = await client_ws.receive_json_from(timeout=5)
        self.assertEqual(c_init.get("type"), "INITIAL_STATE")

        consultant_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/?consultant_token={self.jwt_a}",
        )
        cons_connected, _ = await consultant_ws.connect()
        self.assertTrue(cons_connected)
        cons_init = await consultant_ws.receive_json_from(timeout=5)
        self.assertEqual(cons_init.get("type"), "INITIAL_STATE")

        # Client sends FIELD_SYNC
        await client_ws.send_json_to({
            "type": "FIELD_SYNC",
            "page_id": "discovery",
            "field_key": "client_name",
            "value": "Live Typed Name",
        })

        # Consultant receives FIELD_SYNC
        received = await consultant_ws.receive_json_from(timeout=5)
        self.assertEqual(received.get("type"), "FIELD_SYNC")
        self.assertEqual(received.get("field_key"), "client_name")
        self.assertEqual(received.get("value"), "Live Typed Name")

        await client_ws.disconnect()
        await consultant_ws.disconnect()

    async def test_ws_webrtc_signaling_bidirectional(self):
        """WebRTC signaling messages (offer, answer, ice_candidate) flow correctly between client and consultant."""
        signed_cookie = sign_portal_access_token(self.project_a.portal_token)
        headers = [(b"cookie", f"{PORTAL_ACCESS_COOKIE_NAME}={signed_cookie}".encode("ascii"))]

        client_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/",
            headers=headers,
        )
        c_connected, _ = await client_ws.connect()
        self.assertTrue(c_connected)
        await client_ws.receive_json_from(timeout=5)  # INITIAL_STATE

        consultant_ws = WebsocketCommunicator(
            application,
            f"/ws/support/{self.project_a.portal_token}/?consultant_token={self.jwt_a}",
        )
        cons_connected, _ = await consultant_ws.connect()
        self.assertTrue(cons_connected)
        await consultant_ws.receive_json_from(timeout=5)  # INITIAL_STATE

        # Consultant initiates call
        await consultant_ws.send_json_to({
            "type": "WEBRTC_SIGNAL",
            "action": "call_initiate",
            "data": {"initiator": "consultant"},
        })

        # Client receives call_initiate
        c_sig = await client_ws.receive_json_from(timeout=5)
        self.assertEqual(c_sig.get("type"), "WEBRTC_SIGNAL")
        self.assertEqual(c_sig.get("action"), "call_initiate")

        # Client sends offer
        await client_ws.send_json_to({
            "type": "WEBRTC_SIGNAL",
            "action": "offer",
            "data": {"sdp": "v=0...offer_sdp"},
        })

        # Consultant receives offer
        cons_sig = await consultant_ws.receive_json_from(timeout=5)
        self.assertEqual(cons_sig.get("type"), "WEBRTC_SIGNAL")
        self.assertEqual(cons_sig.get("action"), "offer")
        self.assertEqual(cons_sig.get("data", {}).get("sdp"), "v=0...offer_sdp")

        # Consultant sends answer
        await consultant_ws.send_json_to({
            "type": "WEBRTC_SIGNAL",
            "action": "answer",
            "data": {"sdp": "v=0...answer_sdp"},
        })

        # Client receives answer
        c_ans = await client_ws.receive_json_from(timeout=5)
        self.assertEqual(c_ans.get("type"), "WEBRTC_SIGNAL")
        self.assertEqual(c_ans.get("action"), "answer")

        await client_ws.disconnect()
        await consultant_ws.disconnect()

    # =========================================================================
    # PART B: PERF-001 (Project List Performance & Compatibility Matrix)
    # =========================================================================

    def _setup_workflow_matrix_fixtures(self):
        """Create 11 projects covering all 11 workflow states for Consultant A."""
        Project.objects.filter(consultant=self.consultant_a).delete()
        projects = []
        for i in range(11):
            client = Client.objects.create(
                name=f"Matrix Client {i}",
                email=f"matrix_client_{i}@example.com",
                company_name=f"Matrix Co {i}",
                sector="Tech",
            )
            projects.append(Project(
                title=f"Matrix Project {i}",
                consultant=self.consultant_a,
                client=client,
                company_name=f"Matrix Co {i}",
                sector="Tech",
                portal_password_hash="pbkdf2_sha256$test",
            ))
        Project.objects.bulk_create(projects)
        created = list(Project.objects.filter(consultant=self.consultant_a).order_by("id"))

        # Stage 0: created (no related items)
        # Stage 1: discovery (client_profile)
        ClientProfile.objects.create(project=created[1], client_name="Name")
        # Stage 2: advance_payment (advance ready)
        PaymentMilestone.objects.create(project=created[2], type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.READY, percentage=50)
        # Stage 3: advance_paid (advance paid)
        PaymentMilestone.objects.create(project=created[3], type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.PAID, percentage=50)
        # Stage 4: brand_dna
        BrandDNA.objects.create(project=created[4], brand_personality_cluster="Bold")
        # Stage 5: moodboard
        Moodboard.objects.create(project=created[5], title="Board 1")
        # Stage 6: concept (shared)
        Concept.objects.create(project=created[6], title="Concept 1", status=Concept.Status.SHARED)
        # Stage 7: agreement
        ProjectAgreement.objects.create(project=created[7], status=ProjectAgreement.Status.DRAFT)
        # Stage 8: deliverables (shared)
        Deliverable.objects.create(project=created[8], title="Logo", status=Deliverable.Status.SHARED)
        # Stage 9: final_paid (final paid)
        PaymentMilestone.objects.create(project=created[9], type=PaymentMilestone.Type.FINAL, status=PaymentMilestone.Status.PAID, percentage=25)
        # Stage 10: delivered
        created[10].status = Project.Status.DELIVERED
        created[10].save(update_fields=["status"])

        return created

    def test_project_list_all_11_workflow_status_filters(self):
        """Compatibility Matrix: Each workflow status filter returns exact matching project."""
        created_projects = self._setup_workflow_matrix_fixtures()

        expected_stages = [
            ("created", created_projects[0].id),
            ("discovery", created_projects[1].id),
            ("advance_payment", created_projects[2].id),
            ("advance_paid", created_projects[3].id),
            ("brand_dna", created_projects[4].id),
            ("moodboards", created_projects[5].id),
            ("concepts", created_projects[6].id),
            ("agreement", created_projects[7].id),
            ("deliverables", created_projects[8].id),
            ("final_paid", created_projects[9].id),
            ("delivered", created_projects[10].id),
        ]

        for status_filter, expected_id in expected_stages:
            res = self.api_consultant_a.get(f"/api/projects/?status={status_filter}")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.data["count"], 1, f"Failed count for status={status_filter}")
            self.assertEqual(len(res.data["results"]), 1)
            self.assertEqual(res.data["results"][0]["id"], expected_id)
            self.assertEqual(res.data["results"][0]["workflow_status"], status_filter)

    def test_sql_annotation_multiple_overlapping_relations_and_no_row_duplication(self):
        """
        Verify SQL annotation on complex projects with MULTIPLE overlapping relations
        (multiple moodboards, concepts in various states, deliverables, multiple agreements, milestones).
        Confirms:
        1. Each project appears exactly once (no row multiplication).
        2. SQL Case/When annotation output matches legacy Python calculation 100%.
        """
        Project.objects.filter(consultant=self.consultant_a).delete()

        # Complex Project 1: Overlapping moodboards (3), concepts (2 approved, 1 draft), deliverables (1 shared, 2 draft),
        # both ProjectAgreement AND manual Agreement, multiple milestones -> stage should be final_paid (or delivered if signed off)
        p1 = Project.objects.create(
            title="Complex Alpha",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Alpha Corp",
            sector="Design",
        )
        ClientProfile.objects.create(project=p1, client_name="Alpha Client")
        BrandDNA.objects.create(project=p1, brand_personality_cluster="Bold")
        Moodboard.objects.create(project=p1, title="Board A")
        Moodboard.objects.create(project=p1, title="Board B")
        Moodboard.objects.create(project=p1, title="Board C")
        Concept.objects.create(project=p1, title="Concept A", status=Concept.Status.APPROVED)
        Concept.objects.create(project=p1, title="Concept B", status=Concept.Status.DRAFT)
        ProjectAgreement.objects.create(project=p1, status=ProjectAgreement.Status.ACTIVE)
        Agreement.objects.create(project=p1, title="Manual Agr")
        Deliverable.objects.create(project=p1, title="Deliv 1", status=Deliverable.Status.SHARED)
        Deliverable.objects.create(project=p1, title="Deliv 2", status=Deliverable.Status.DRAFT)
        PaymentMilestone.objects.create(project=p1, type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.PAID, percentage=50)
        PaymentMilestone.objects.create(project=p1, type=PaymentMilestone.Type.MID, status=PaymentMilestone.Status.PAID, percentage=25)
        PaymentMilestone.objects.create(project=p1, type=PaymentMilestone.Type.FINAL, status=PaymentMilestone.Status.PAID, percentage=25)

        # Complex Project 2: Overlapping moodboards + draft concepts + draft deliverable + draft agreement -> should be 'agreement'
        p2 = Project.objects.create(
            title="Complex Beta",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Beta Corp",
            sector="Finance",
        )
        BrandDNA.objects.create(project=p2, brand_personality_cluster="Classic")
        Moodboard.objects.create(project=p2, title="Board Beta")
        Concept.objects.create(project=p2, title="Draft Concept", status=Concept.Status.DRAFT)
        Deliverable.objects.create(project=p2, title="Draft Deliv", status=Deliverable.Status.DRAFT)
        ProjectAgreement.objects.create(project=p2, status=ProjectAgreement.Status.DRAFT)
        PaymentMilestone.objects.create(project=p2, type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.PAID, percentage=50)

        # Complex Project 3: Overlapping moodboards + 3 draft concepts + BrandDNA + Advance Ready -> should be 'moodboards'
        p3 = Project.objects.create(
            title="Complex Gamma",
            consultant=self.consultant_a,
            client=self.client_a,
            company_name="Gamma Inc",
            sector="Tech",
        )
        BrandDNA.objects.create(project=p3, brand_personality_cluster="Innovative")
        Moodboard.objects.create(project=p3, title="Board Gamma 1")
        Moodboard.objects.create(project=p3, title="Board Gamma 2")
        Concept.objects.create(project=p3, title="Concept G1", status=Concept.Status.DRAFT)
        Concept.objects.create(project=p3, title="Concept G2", status=Concept.Status.DRAFT)
        PaymentMilestone.objects.create(project=p3, type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.READY, percentage=50)

        # Test direct ORM annotation
        annotated_qs = Project.objects.filter(consultant=self.consultant_a).annotate(
            annotated_workflow_status=get_workflow_status_annotation()
        ).order_by("id")

        # 1. Verify no row duplication
        self.assertEqual(annotated_qs.count(), 3)
        self.assertEqual(len(list(annotated_qs)), 3)

        # 2. Verify SQL annotation matches legacy python function for every project
        for proj in annotated_qs:
            legacy_status = calculate_project_workflow_status(proj)
            self.assertEqual(
                proj.annotated_workflow_status,
                legacy_status,
                f"Mismatch for project {proj.id}: SQL={proj.annotated_workflow_status}, Legacy={legacy_status}",
            )

        # 3. Verify specific expected statuses
        p1_res = annotated_qs.get(id=p1.id)
        self.assertEqual(p1_res.annotated_workflow_status, "final_paid")

        p2_res = annotated_qs.get(id=p2.id)
        self.assertEqual(p2_res.annotated_workflow_status, "agreement")

        p3_res = annotated_qs.get(id=p3.id)
        self.assertEqual(p3_res.annotated_workflow_status, "moodboards")

    def test_combined_search_and_workflow_filter_and_pagination(self):
        """Combined search + workflow status filtering paginates accurately with correct counts and no duplicate rows."""
        Project.objects.filter(consultant=self.consultant_a).delete()

        # Create 15 projects with status=concepts and 10 with status=discovery
        projects = []
        for i in range(25):
            is_concept = i < 15
            p = Project.objects.create(
                title=f"UniqueAlpha Project {i}" if i % 2 == 0 else f"OtherBeta Project {i}",
                consultant=self.consultant_a,
                client=self.client_a,
                company_name=f"AlphaCompany {i}" if i % 2 == 0 else f"BetaCompany {i}",
                sector="Tech",
            )
            if is_concept:
                Concept.objects.create(project=p, title=f"Concept {i}", status=Concept.Status.SHARED)
            else:
                ClientProfile.objects.create(project=p, client_name=f"Client {i}")

        # Combined search: search=UniqueAlpha & status=concepts
        # Expected: even indices in [0..14] => 0, 2, 4, 6, 8, 10, 12, 14 => 8 projects
        res = self.api_consultant_a.get("/api/projects/?search=UniqueAlpha&status=concepts&page=1&page_size=5")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 8)
        self.assertEqual(len(res.data["results"]), 5)
        self.assertTrue(res.data["has_more"])
        self.assertEqual(res.data["total_pages"], 2)

        # Page 2
        res2 = self.api_consultant_a.get("/api/projects/?search=UniqueAlpha&status=concepts&page=2&page_size=5")
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(len(res2.data["results"]), 3)
        self.assertFalse(res2.data["has_more"])

        # Disjoint verification
        p1_ids = {p["id"] for p in res.data["results"]}
        p2_ids = {p["id"] for p in res2.data["results"]}
        self.assertEqual(len(p1_ids), 5)
        self.assertEqual(len(p2_ids), 3)
        self.assertTrue(p1_ids.isdisjoint(p2_ids))
        self.assertEqual(len(p1_ids | p2_ids), 8)

    def test_sql_query_count_constant_budget(self):
        """Verify project list endpoint operates with constant query count regardless of dataset size (no N+1)."""
        Project.objects.filter(consultant=self.consultant_a).delete()

        bulk_projects = [
            Project(
                title=f"QueryBudget Project {i}",
                consultant=self.consultant_a,
                client=self.client_a,
                company_name=f"Company {i}",
                sector="Tech",
            )
            for i in range(30)
        ]
        Project.objects.bulk_create(bulk_projects)

        created_objs = list(Project.objects.filter(consultant=self.consultant_a))
        for p in created_objs:
            Concept.objects.create(project=p, title="Concept", status=Concept.Status.SHARED)

        reset_queries()
        res = self.api_consultant_a.get("/api/projects/?status=concepts&page=1&page_size=10")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 30)
        self.assertEqual(len(res.data["results"]), 10)

        query_count = len(connection.queries)
        # Query count should be exactly: 1 count/filter query + 1 paginated items query + prefetches for the 10 sliced items
        self.assertLessEqual(query_count, 15, f"Expected small constant query count, got {query_count}")

    def test_project_list_consultant_ownership_isolation(self):
        """Consultant A cannot see Consultant B's projects."""
        res_a = self.api_consultant_a.get("/api/projects/")
        self.assertEqual(res_a.status_code, 200)
        proj_ids_a = {p["id"] for p in res_a.data["results"]}
        self.assertIn(self.project_a.id, proj_ids_a)
        self.assertNotIn(self.project_b.id, proj_ids_a)

        res_b = self.api_consultant_b.get("/api/projects/")
        self.assertEqual(res_b.status_code, 200)
        proj_ids_b = {p["id"] for p in res_b.data["results"]}
        self.assertIn(self.project_b.id, proj_ids_b)
        self.assertNotIn(self.project_a.id, proj_ids_b)

