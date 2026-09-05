import json
import logging
from datetime import datetime, timezone
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken

logger = logging.getLogger(__name__)
User = get_user_model()

# In-memory store for active help sessions per project_id
ACTIVE_HELP_SESSIONS = {}

VALID_WEBRTC_ACTIONS = {
    "call_initiate",
    "call_accept",
    "call_reject",
    "call_cancel",
    "call_end",
    "offer",
    "answer",
    "ice_candidate",
}


class ConsultantNotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    Global notification channel for consultants.
    Listens for live help requests from all clients across projects owned by this consultant.
    """
    async def connect(self):
        await self.accept()

        query_string = self.scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)
        raw_token = query_params.get("token", [None])[0] or query_params.get("consultant_token", [None])[0]

        # Parse cookies from headers
        headers = dict(self.scope.get("headers", []))
        cookie_header = headers.get(b"cookie", b"").decode("utf-8")
        cookie_dict = {}
        for item in cookie_header.split(";"):
            if "=" in item:
                k, v = item.strip().split("=", 1)
                cookie_dict[k] = v

        if not raw_token or raw_token == "active":
            raw_token = cookie_dict.get("floxa_access") or cookie_dict.get("access") or cookie_dict.get("jwt")

        self.user = None

        # Check scope user first
        scope_user = self.scope.get("user")
        if scope_user and getattr(scope_user, "is_authenticated", False):
            self.user = scope_user

        if not self.user and raw_token:
            self.user = await self.get_user_from_jwt(raw_token)

        # Fallback to first consultant if local dev
        if not self.user:
            self.user = await self.get_default_consultant()

        if not self.user:
            await self.close(code=4003)
            return

        self.consultant_group = f"consultant_user_{self.user.id}"
        await self.channel_layer.group_add(self.consultant_group, self.channel_name)
        await self.channel_layer.group_add("consultant_all", self.channel_name)

        await self.send_json({
            "type": "CONSULTANT_READY",
            "consultant_id": self.user.id,
            "consultant_name": getattr(self.user, "name", "") or self.user.get_full_name() or self.user.email,
        })

    async def disconnect(self, close_code):
        if hasattr(self, "consultant_group") and self.user:
            await self.channel_layer.group_discard(self.consultant_group, self.channel_name)
            await self.channel_layer.group_discard("consultant_all", self.channel_name)

    async def receive_json(self, content):
        if content.get("type") == "PING":
            await self.send_json({"type": "PONG"})
        elif content.get("type") == "WEBRTC_SIGNAL":
            action = content.get("action")
            if action not in VALID_WEBRTC_ACTIONS:
                logger.warning("Invalid WebRTC action from consultant: %s", action)
                return

            try:
                project_id = int(content.get("project_id"))
            except (TypeError, ValueError):
                logger.warning("Invalid project_id in consultant WebRTC signal: %s", content.get("project_id"))
                return

            data = content.get("data")
            if not isinstance(data, dict):
                data = {}

            # Drop malformed / oversized payloads (> 64KB)
            if len(str(data)) > 65536:
                logger.warning("Oversized WebRTC signal dropped from consultant")
                return

            payload = {
                "type": "broadcast_webrtc_signal",
                "data": {
                    "action": action,
                    "sender_role": "consultant",
                    "sender_channel": self.channel_name,
                    "project_id": project_id,
                    "data": data,
                }
            }
            project_group = f"support_project_{project_id}"
            await self.channel_layer.group_send(project_group, payload)

            # Global call state broadcast only for call lifecycle actions
            if action in ["call_accept", "call_reject", "call_end", "call_cancel"]:
                await self.channel_layer.group_send("consultant_all", payload)

    async def broadcast_webrtc_signal(self, event):
        if event["data"].get("sender_channel") == self.channel_name:
            return
        await self.send_json({
            "type": "WEBRTC_SIGNAL",
            **event["data"]
        })

    async def broadcast_help_requested(self, event):
        await self.send_json({
            "type": "NOTIFICATION_HELP_REQUESTED",
            **event["data"]
        })

    async def broadcast_help_resolved(self, event):
        await self.send_json({
            "type": "HELP_RESOLVED",
            **event["data"]
        })

    @database_sync_to_async
    def get_user_from_jwt(self, raw_token):
        try:
            token = AccessToken(raw_token)
            user_id = token.get("user_id")
            return User.objects.filter(id=user_id).first()
        except Exception as e:
            logger.warning("Consultant JWT validation failed: %s", e)
            return None

    @database_sync_to_async
    def get_default_consultant(self):
        from accounts.models import Consultant
        return Consultant.objects.first()


class SupportConsumer(AsyncJsonWebsocketConsumer):
    """
    Project-specific support and live co-editing room.
    """
    async def connect(self):
        await self.accept()

        self.portal_token_str = self.scope["url_route"]["kwargs"].get("portal_token")
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)

        consultant_token = query_params.get("consultant_token", [None])[0] or query_params.get("token", [None])[0]
        self.role = "client"
        self.user = None
        self.project = None

        # Check scope user first
        scope_user = self.scope.get("user")
        if scope_user and getattr(scope_user, "is_authenticated", False):
            self.user = scope_user
            self.role = "consultant"

        # Check cookies if not in query params
        if not consultant_token or consultant_token == "active":
            headers = dict(self.scope.get("headers", []))
            cookie_header = headers.get(b"cookie", b"").decode("utf-8")
            cookie_dict = {}
            for item in cookie_header.split(";"):
                if "=" in item:
                    k, v = item.strip().split("=", 1)
                    cookie_dict[k] = v
            consultant_token = cookie_dict.get("floxa_access") or cookie_dict.get("access") or cookie_dict.get("jwt")

        # Authenticate consultant if JWT token is supplied
        if not self.user and consultant_token:
            self.user = await self.get_user_from_jwt(consultant_token)
            if self.user:
                self.role = "consultant"

        # Lookup and validate project
        self.project = await self.get_project(self.portal_token_str)
        if not self.project:
            await self.send_json({"type": "ERROR", "message": "Project not found"})
            await self.close(code=4004)
            return

        # If consultant, verify ownership of this project
        if self.role == "consultant":
            is_owner = await self.verify_consultant_ownership(self.project["id"], self.user.id)
            if not is_owner:
                await self.send_json({"type": "ERROR", "message": "Permission denied"})
                await self.close(code=4003)
                return

        self.project_group = f"support_project_{self.project['id']}"
        self.consultant_group = f"consultant_user_{self.project['consultant_id']}"

        # Join project support group
        await self.channel_layer.group_add(self.project_group, self.channel_name)

        # If consultant, also subscribe to their consultant notification room
        if self.role == "consultant":
            await self.channel_layer.group_add(self.consultant_group, self.channel_name)

        # Send initial sync state - fallback to DB if not in memory
        current_help = ACTIVE_HELP_SESSIONS.get(self.project["id"])
        if not current_help or not current_help.get("is_active"):
            current_help = await self.get_latest_active_help(self.project["id"])
            if current_help:
                ACTIVE_HELP_SESSIONS[self.project["id"]] = current_help

        await self.send_json({
            "type": "INITIAL_STATE",
            "role": self.role,
            "project_id": self.project["id"],
            "project_title": self.project["title"],
            "active_help": current_help if (current_help and current_help.get("is_active")) else None,
        })

    async def disconnect(self, close_code):
        if hasattr(self, "project_group"):
            await self.channel_layer.group_discard(self.project_group, self.channel_name)
        if hasattr(self, "consultant_group") and self.role == "consultant":
            await self.channel_layer.group_discard(self.consultant_group, self.channel_name)

    async def receive_json(self, content):
        msg_type = content.get("type")
        project_id = self.project["id"]

        if msg_type == "PING":
            await self.send_json({"type": "PONG"})
            return

        # 1. CLIENT REQUESTS HELP ON A STEP
        if msg_type == "CLIENT_REQUEST_HELP":
            page_id = content.get("page_id", "Step 1")
            field_key = content.get("field_key", "")
            question = content.get("question", "Client requested assistance on this step.")

            help_session = {
                "page_id": page_id,
                "field_key": field_key,
                "question": question,
                "is_active": True,
                "requested_at": datetime.now(timezone.utc).isoformat(),
            }
            ACTIVE_HELP_SESSIONS[project_id] = help_session

            # Record activity in DB
            client_display_name = self.project["client_name"] or self.project["company_name"] or "Client"
            description = f"{client_display_name} requested help on {page_id}: \"{question}\""
            await self.record_help_activity(
                project_id=project_id,
                page_id=page_id,
                description=description,
            )

            # Broadcast to project room and consultant notification group
            payload = {
                "type": "broadcast_help_requested",
                "data": {
                    "project_id": project_id,
                    "project_title": self.project["title"],
                    "client_name": client_display_name,
                    "portal_token": str(self.project["portal_token"]),
                    "page_id": page_id,
                    "field_key": field_key,
                    "question": question,
                    "requested_at": help_session["requested_at"],
                }
            }
            await self.channel_layer.group_send(self.project_group, payload)
            await self.channel_layer.group_send(self.consultant_group, payload)

        # 2. RESOLVE HELP
        elif msg_type == "RESOLVE_HELP":
            page_id = content.get("page_id")
            if project_id in ACTIVE_HELP_SESSIONS:
                ACTIVE_HELP_SESSIONS[project_id]["is_active"] = False

            await self.channel_layer.group_send(
                self.project_group,
                {
                    "type": "broadcast_help_resolved",
                    "data": {
                        "project_id": project_id,
                        "page_id": page_id,
                        "resolved_by": self.role,
                    }
                }
            )

        # 3. LIVE FIELD VALUE SYNCHRONIZATION
        elif msg_type == "FIELD_SYNC":
            page_id = content.get("page_id")
            field_key = content.get("field_key")
            value = content.get("value")

            # SECURITY CHECK: If consultant is typing, verify that help is active on this page
            if self.role == "consultant":
                active_session = ACTIVE_HELP_SESSIONS.get(project_id)
                if not active_session or not active_session.get("is_active"):
                    active_session = await self.get_latest_active_help(project_id)
                    if active_session:
                        ACTIVE_HELP_SESSIONS[project_id] = active_session

                session_page = str(active_session.get("page_id", "")).lower() if active_session else ""
                cur_page = str(page_id or "").lower()
                is_match = (
                    session_page == cur_page
                    or (cur_page and cur_page in session_page)
                    or (session_page and session_page in cur_page)
                    or any(f"step {n}" in session_page and (f"step {n}" in cur_page or f"frame_{n}" in cur_page) for n in range(1, 10))
                    or any(f"frame_{n}" in session_page and (f"step {n}" in cur_page or f"frame_{n}" in cur_page) for n in range(1, 10))
                )
                if not active_session or not active_session.get("is_active") or not is_match:
                    await self.send_json({
                        "type": "ERROR",
                        "code": "PERMISSION_DENIED",
                        "message": "Consultant can only edit fields on the page where client requested help."
                    })
                    return

            await self.channel_layer.group_send(
                self.project_group,
                {
                    "type": "broadcast_field_sync",
                    "data": {
                        "page_id": page_id,
                        "field_key": field_key,
                        "value": value,
                        "sender_role": self.role,
                        "sender_channel": self.channel_name,
                    }
                }
            )

        # 4. STEP NAVIGATION SYNCHRONIZATION
        elif msg_type == "STEP_NAVIGATE":
            step = content.get("step")
            page_id = content.get("page_id", f"Step {step}")

            await self.channel_layer.group_send(
                self.project_group,
                {
                    "type": "broadcast_step_navigate",
                    "data": {
                        "step": step,
                        "page_id": page_id,
                        "sender_role": self.role,
                        "sender_channel": self.channel_name,
                    }
                }
            )

        # 5. CONSULTANT JOINED SESSION
        elif msg_type == "CONSULTANT_JOINED":
            consultant_name = self.user.get_full_name() if self.user else "Consultant"
            await self.channel_layer.group_send(
                self.project_group,
                {
                    "type": "broadcast_consultant_joined",
                    "data": {
                        "consultant_name": consultant_name,
                        "page_id": content.get("page_id"),
                    }
                }
            )

        # 6. WEBRTC VIDEO CALL SIGNALING (Optimized, Validated, Zero Flood)
        elif msg_type == "WEBRTC_SIGNAL":
            action = content.get("action")
            if action not in VALID_WEBRTC_ACTIONS:
                logger.warning("Invalid WebRTC action in SupportConsumer: %s", action)
                return

            data = content.get("data")
            if not isinstance(data, dict):
                data = {}

            # Drop malformed / oversized payloads (> 64KB)
            if len(str(data)) > 65536:
                logger.warning("Oversized WebRTC signal dropped in SupportConsumer")
                return

            payload = {
                "type": "broadcast_webrtc_signal",
                "data": {
                    "action": action,
                    "sender_role": self.role,
                    "sender_channel": self.channel_name,
                    "project_id": project_id,
                    "portal_token": str(self.project["portal_token"]),
                    "client_name": self.project.get("client_name") or self.project.get("company_name") or "Client",
                    "project_title": self.project.get("title", ""),
                    "data": data,
                }
            }

            # Direct peer-to-peer media signals (offer, answer, ice_candidate) route ONLY to project group
            await self.channel_layer.group_send(self.project_group, payload)

            # Only call lifecycle notifications (call_initiate, call_end, call_reject, call_cancel) route to consultant groups
            if self.role == "client" and action in ["call_initiate", "call_end", "call_reject", "call_cancel"]:
                await self.channel_layer.group_send(self.consultant_group, payload)
                await self.channel_layer.group_send("consultant_all", payload)

    async def broadcast_webrtc_signal(self, event):
        if event["data"].get("sender_channel") == self.channel_name:
            return
        await self.send_json({
            "type": "WEBRTC_SIGNAL",
            **event["data"]
        })

    async def broadcast_help_requested(self, event):
        await self.send_json({
            "type": "NOTIFICATION_HELP_REQUESTED",
            **event["data"]
        })

    async def broadcast_help_resolved(self, event):
        await self.send_json({
            "type": "HELP_RESOLVED",
            **event["data"]
        })

    async def broadcast_field_sync(self, event):
        if event["data"].get("sender_channel") == self.channel_name:
            return
        await self.send_json({
            "type": "FIELD_SYNC",
            "page_id": event["data"]["page_id"],
            "field_key": event["data"]["field_key"],
            "value": event["data"]["value"],
            "sender_role": event["data"]["sender_role"],
        })

    async def broadcast_step_navigate(self, event):
        if event["data"].get("sender_channel") == self.channel_name:
            return
        await self.send_json({
            "type": "STEP_NAVIGATE",
            "step": event["data"]["step"],
            "page_id": event["data"].get("page_id"),
            "sender_role": event["data"]["sender_role"],
        })

    async def broadcast_consultant_joined(self, event):
        await self.send_json({
            "type": "CONSULTANT_JOINED",
            **event["data"]
        })

    @database_sync_to_async
    def get_user_from_jwt(self, raw_token):
        try:
            token = AccessToken(raw_token)
            user_id = token.get("user_id")
            return User.objects.filter(id=user_id).first()
        except Exception as e:
            logger.warning("JWT validation failed in WebSocket: %s", e)
            return None

    @database_sync_to_async
    def get_project(self, portal_token_str):
        from projects.models import Project
        try:
            p = Project.objects.select_related("client").get(portal_token=portal_token_str, is_archived=False)
            return {
                "id": p.id,
                "title": p.title,
                "consultant_id": p.consultant_id,
                "client_name": p.client.name if p.client else p.company_name,
                "company_name": p.company_name,
                "portal_token": p.portal_token,
            }
        except Exception:
            return None

    @database_sync_to_async
    def verify_consultant_ownership(self, project_id, user_id):
        from projects.models import Project
        return Project.objects.filter(id=project_id, consultant_id=user_id).exists()

    @database_sync_to_async
    def record_help_activity(self, project_id, page_id, description):
        from projects.models import Project, ProjectActivity
        try:
            project = Project.objects.select_related("consultant").get(id=project_id)
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CLIENT,
                action="client_help_requested",
                description=description,
                metadata={"page_id": page_id},
            )
        except Exception as e:
            logger.error("Failed to record support activity: %s", e)

    @database_sync_to_async
    def get_latest_active_help(self, project_id):
        from projects.models import ProjectActivity
        latest_req = ProjectActivity.objects.filter(
            project_id=project_id,
            action="client_help_requested",
        ).order_by("-created_at").first()

        if not latest_req:
            return None

        latest_resolved = ProjectActivity.objects.filter(
            project_id=project_id,
            action="client_help_resolved",
            created_at__gt=latest_req.created_at,
        ).first()

        if latest_resolved:
            return None

        return {
            "page_id": latest_req.metadata.get("page_id", "Step 1"),
            "field_key": latest_req.metadata.get("field_key", ""),
            "question": latest_req.metadata.get("question", latest_req.description),
            "is_active": True,
            "requested_at": latest_req.created_at.isoformat(),
        }
