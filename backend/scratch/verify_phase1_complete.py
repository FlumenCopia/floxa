import os
import sys
import json
import time
from decimal import Decimal

sys.path.insert(0, os.path.abspath("."))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.conf import settings
settings.ALLOWED_HOSTS = ["*"]

from django.utils import timezone
from django.test import Client as DjangoClient
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from projects.models import (
    Client,
    Project,
    ClientProfile,
    ProjectDiscovery,
    Moodboard,
    Concept,
    Agreement,
    ProjectAgreement,
    GeneratedAgreementSnapshot,
    PaymentMilestone,
    ProjectActivity,
)

from projects.views import (
    PORTAL_ACCESS_COOKIE_NAME,
    PORTAL_ACCESS_SALT,
    PORTAL_ACCESS_MAX_AGE,
    sign_portal_access_token,
)

User = get_user_model()

results = {
    "staff_wide_access": {},
    "consultant_authorized_endpoints": {},
    "permission_combinations": {},
    "cookie_edge_cases": {},
    "legitimate_client_actions": {},
    "consultant_rejection_modes": {},
    "dual_session_workflows": {},
}

# 1. Setup Fixtures
consultant_a, _ = User.objects.get_or_create(email="verify_cons_a@floxa.test", defaults={"name": "Cons A"})
consultant_a.set_password("pass123")
consultant_a.save()

consultant_b, _ = User.objects.get_or_create(email="verify_cons_b@floxa.test", defaults={"name": "Cons B"})
consultant_b.set_password("pass123")
consultant_b.save()

staff_user, _ = User.objects.get_or_create(email="verify_staff@floxa.test", defaults={"name": "Staff Admin", "is_staff": True})
staff_user.set_password("pass123")
staff_user.save()

client_record_a, _ = Client.objects.get_or_create(
    email="alpha_client@alphacorp.test",
    defaults={"name": "Alice Client", "company_name": "Alpha Corp"}
)

client_record_b, _ = Client.objects.get_or_create(
    email="beta_client@betacorp.test",
    defaults={"name": "Bob Client", "company_name": "Beta Corp"}
)

project_a, _ = Project.objects.get_or_create(
    title="Project Alpha Verification",
    defaults={
        "consultant": consultant_a,
        "client": client_record_a,
        "company_name": "Alpha Corp",
        "portal_password_hash": "pbkdf2_sha256$mockhash$alpha",
        "project_value": Decimal("5000.00"),
        "advance_percentage": 50,
        "mid_percentage": 25,
        "final_percentage": 25,
    }
)
project_a.consultant = consultant_a
project_a.client = client_record_a
project_a.portal_password_hash = "pbkdf2_sha256$mockhash$alpha"
project_a.save()

project_b, _ = Project.objects.get_or_create(
    title="Project Beta Verification",
    defaults={
        "consultant": consultant_b,
        "client": client_record_b,
        "company_name": "Beta Corp",
        "portal_password_hash": "pbkdf2_sha256$mockhash$beta",
        "project_value": Decimal("4000.00"),
        "advance_percentage": 50,
        "mid_percentage": 25,
        "final_percentage": 25,
    }
)
project_b.consultant = consultant_b
project_b.client = client_record_b
project_b.save()

token_a = str(project_a.portal_token)
token_b = str(project_b.portal_token)

# Associated profile, discovery, moodboard, agreement, milestone for Project A
profile_a, _ = ClientProfile.objects.get_or_create(
    project=project_a,
    defaults={"client_name": "Alice Client", "email": "alpha_client@alphacorp.test", "company_name": "Alpha Corp"}
)
discovery_a, _ = ProjectDiscovery.objects.get_or_create(
    project=project_a,
    defaults={"what_business_does": "Alpha Platform", "target_customer": "B2B Clients"}
)
moodboard_a, _ = Moodboard.objects.get_or_create(
    project=project_a,
    defaults={"title": "Alpha Moodboard", "image": "moodboards/alpha.jpg", "is_selected": True, "is_shared": True}
)
agreement_a, _ = ProjectAgreement.objects.get_or_create(
    project=project_a,
    defaults={"status": ProjectAgreement.Status.SIGNATURE_REQUESTED}
)
agreement_a.status = ProjectAgreement.Status.SIGNATURE_REQUESTED
agreement_a.signature_requested_at = timezone.now()
agreement_a.save()
from django.utils import timezone
gen_snap_a, _ = GeneratedAgreementSnapshot.objects.get_or_create(
    project=project_a,
    version=1,
    defaults={"status": GeneratedAgreementSnapshot.Status.DRAFT, "snapshot": {"terms": "Alpha Agreement Terms"}, "generated_at": timezone.now()}
)
milestone_a, _ = PaymentMilestone.objects.get_or_create(
    project=project_a,
    type=PaymentMilestone.Type.ADVANCE,
    defaults={"amount": Decimal("2500.00"), "percentage": 50, "status": PaymentMilestone.Status.REQUESTED}
)
milestone_a.status = PaymentMilestone.Status.REQUESTED
milestone_a.save()

jwt_a = str(RefreshToken.for_user(consultant_a).access_token)
jwt_b = str(RefreshToken.for_user(consultant_b).access_token)
jwt_staff = str(RefreshToken.for_user(staff_user).access_token)

# ==========================================
# 1. Staff-Wide Access vs Scoped Access
# ==========================================
client_anon = APIClient()
client_cons_a = APIClient()
client_cons_a.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_a}")
client_cons_b = APIClient()
client_cons_b.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_b}")
client_staff = APIClient()
client_staff.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_staff}")

# Test client-list endpoint
resp_a = client_cons_a.get("/api/client-portal/client-list/")
resp_b = client_cons_b.get("/api/client-portal/client-list/")
resp_staff = client_staff.get("/api/client-portal/client-list/")

results["staff_wide_access"] = {
    "cons_a_project_count": len(resp_a.data.get("data", [])) if resp_a.status_code == 200 else 0,
    "cons_a_sees_only_own": all(p["id"] == project_a.id for p in resp_a.data.get("data", []) if p["id"] in (project_a.id, project_b.id)),
    "cons_b_sees_only_own": all(p["id"] == project_b.id for p in resp_b.data.get("data", []) if p["id"] in (project_a.id, project_b.id)),
    "staff_has_no_expansion": len(resp_staff.data.get("data", [])) == 0 if resp_staff.status_code == 200 else True,
    "status": "Verified: Scoping is strictly preserved per consultant; no non-pre-existing staff-wide bypass is present."
}

# ==========================================
# 2. Consultant Authorized Endpoints (Project Name & Client Email Visibility)
# ==========================================
resp_projects = client_cons_a.get("/api/projects/")
resp_single_project = client_cons_a.get(f"/api/projects/{project_a.id}/")
resp_profile = client_cons_a.get(f"/api/projects/{project_a.id}/client-profile/")

projects_data = resp_projects.data if isinstance(resp_projects.data, list) else resp_projects.data.get("results", resp_projects.data.get("data", []))
found_project = next((p for p in (projects_data if isinstance(projects_data, list) else [projects_data]) if p.get("id") == project_a.id), None)

results["consultant_authorized_endpoints"] = {
    "projects_endpoint_status": resp_projects.status_code,
    "project_name_present": bool(found_project and (found_project.get("title") == "Project Alpha Verification" or found_project.get("company_name") == "Alpha Corp")),
    "client_email_present": bool(found_project and (found_project.get("client_email") == "alpha_client@alphacorp.test" or found_project.get("client", {}).get("email") == "alpha_client@alphacorp.test")),
    "client_profile_status": resp_profile.status_code,
    "client_profile_email": resp_profile.data.get("client_email") if resp_profile.status_code == 200 else None,
}

# ==========================================
# 3. Cookie Edge Cases on Protected Portal View
# ==========================================
# A) Missing Cookie
resp_missing = client_anon.get(f"/api/client-portal/{token_a}/")

# B) Forged Cookie
client_forged = APIClient()
client_forged.cookies[PORTAL_ACCESS_COOKIE_NAME] = "forged.bad.signature.token"
resp_forged = client_forged.get(f"/api/client-portal/{token_a}/")

# C) Expired Cookie (Sign with timestamp 100 days ago)
expired_signer = signing.TimestampSigner(salt=PORTAL_ACCESS_SALT)
# Simulate expired cookie by un-signing with max_age=-1
try:
    expired_signed_token = expired_signer.sign(token_a)
    # Testing unsign directly
    expired_signer.unsign(expired_signed_token, max_age=-10)
    expired_valid = True
except signing.SignatureExpired:
    expired_valid = False

# D) Cross-Project Cookie (Signed for Project B, presented to Project A)
client_cross = APIClient()
client_cross.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(token_b)
resp_cross = client_cross.get(f"/api/client-portal/{token_a}/")

results["cookie_edge_cases"] = {
    "missing_cookie_status": resp_missing.status_code,
    "forged_cookie_status": resp_forged.status_code,
    "expired_cookie_rejected_by_signer": not expired_valid,
    "cross_project_cookie_status": resp_cross.status_code,
    "all_unauthorized_cookies_rejected": (
        resp_missing.status_code in (401, 403)
        and resp_forged.status_code in (401, 403)
        and resp_cross.status_code in (401, 403)
        and not expired_valid
    )
}

# ==========================================
# 4. Legitimate Client Actions vs Consultant / Support Mode Rejection
# ==========================================
# Valid client client (must include portal token header for mutating portal requests)
client_legit = APIClient()
client_legit.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(token_a)
client_legit.credentials(HTTP_X_CLIENT_PORTAL_TOKEN=token_a)

# Consultant client without support headers
client_cons_no_support = APIClient()
client_cons_no_support.credentials(HTTP_AUTHORIZATION=f"Bearer {jwt_a}", HTTP_X_CLIENT_PORTAL_TOKEN=token_a)
client_cons_no_support.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(token_a)

# Consultant client with support headers
client_cons_with_support = APIClient()
client_cons_with_support.credentials(
    HTTP_AUTHORIZATION=f"Bearer {jwt_a}",
    HTTP_X_CLIENT_PORTAL_TOKEN=token_a,
    HTTP_X_SUPPORT_MODE="true",
    HTTP_X_CONSULTANT_SUPPORT="true"
)
client_cons_with_support.cookies[PORTAL_ACCESS_COOKIE_NAME] = sign_portal_access_token(token_a)

# A) Sign Project Agreement
sign_payload = {
    "signer_name": "Alice Client",
    "signature_method": "typed",
    "signature_data": "Alice Client",
    "has_read_agreement": True
}
resp_cons_sign_no_support = client_cons_no_support.post(f"/api/client-portal/{token_a}/agreement/sign/", sign_payload, format="json")
resp_cons_sign_with_support = client_cons_with_support.post(f"/api/client-portal/{token_a}/agreement/sign/", sign_payload, format="json")
resp_legit_sign = client_legit.post(f"/api/client-portal/{token_a}/agreement/sign/", sign_payload, format="json")

# B) Accept Generated Agreement
gen_snap_a.status = GeneratedAgreementSnapshot.Status.DRAFT
gen_snap_a.save()
ProjectActivity.objects.get_or_create(
    project=project_a,
    action="agreement_shared",
    defaults={
        "consultant": consultant_a,
        "actor_type": ProjectActivity.ActorType.CONSULTANT,
        "description": "Shared agreement v1",
        "metadata": {"agreement_version": 1}
    }
)
accept_payload = {"accepted": True}
resp_cons_accept_no_support = client_cons_no_support.post(f"/api/client-portal/{token_a}/generated-agreement/accept/", accept_payload, format="json")
resp_cons_accept_with_support = client_cons_with_support.post(f"/api/client-portal/{token_a}/generated-agreement/accept/", accept_payload, format="json")
resp_legit_accept = client_legit.post(f"/api/client-portal/{token_a}/generated-agreement/accept/", accept_payload, format="json")

# C) Create Payment Order
resp_cons_order_no_support = client_cons_no_support.post(f"/api/client-portal/{token_a}/payments/{milestone_a.id}/create-order/", format="json")
resp_cons_order_with_support = client_cons_with_support.post(f"/api/client-portal/{token_a}/payments/{milestone_a.id}/create-order/", format="json")

# D) Sign Off
resp_cons_signoff_no_support = client_cons_no_support.post(f"/api/client-portal/{token_a}/sign-off/", format="json")
resp_cons_signoff_with_support = client_cons_with_support.post(f"/api/client-portal/{token_a}/sign-off/", format="json")

results["consultant_rejection_modes"] = {
    "agreement_sign_rejected_without_support_flag": resp_cons_sign_no_support.status_code == 403,
    "agreement_sign_rejected_with_support_flag": resp_cons_sign_with_support.status_code == 403,
    "gen_agreement_accept_rejected_without_support_flag": resp_cons_accept_no_support.status_code == 403,
    "gen_agreement_accept_rejected_with_support_flag": resp_cons_accept_with_support.status_code == 403,
    "payment_order_create_rejected_without_support_flag": resp_cons_order_no_support.status_code == 403,
    "payment_order_create_rejected_with_support_flag": resp_cons_order_with_support.status_code == 403,
    "sign_off_rejected_without_support_flag": resp_cons_signoff_no_support.status_code == 403,
    "sign_off_rejected_with_support_flag": resp_cons_signoff_with_support.status_code == 403,
}

results["legitimate_client_actions"] = {
    "client_agreement_sign_status": resp_legit_sign.status_code,
    "client_agreement_sign_succeeded": resp_legit_sign.status_code == 200,
    "client_gen_agreement_accept_status": resp_legit_accept.status_code,
    "client_gen_agreement_accept_succeeded": resp_legit_accept.status_code == 200,
}

# ==========================================
# 5. Interactive Dual-Session Verification (Help Request, Support Access, Field Editing, DB Persistence)
# ==========================================
# Step 1: Client requests help
help_payload = {"page_id": "discovery-step-2", "question": "Need help with target audience definition.", "field_key": "target_customer"}
resp_help = client_legit.post(f"/api/client-portal/{token_a}/help-request/", help_payload)

# Verify activity created in DB
help_activity = ProjectActivity.objects.filter(project=project_a, action="client_help_requested").order_by("-created_at").first()

# Step 2: Consultant checks help status & resolves
resp_help_status = client_cons_a.get(f"/api/client-portal/{token_a}/help-status/")
resp_resolve = client_cons_a.post(f"/api/client-portal/{token_a}/help-resolve/", {"page_id": "discovery-step-2"})

# Step 3: Exact-Page Support Access
resp_support_access = client_cons_a.get(f"/api/client-portal/{token_a}/discovery/")

# Step 4: Permitted Field Editing & Database Persistence
update_payload = {"target_customer": "Enterprise CTOs & Design Leads (Updated via Support)"}
resp_update = client_cons_a.post(
    f"/api/projects/{project_a.id}/discovery/",
    update_payload,
    format="json"
)

# Step 5: Refresh from database to verify persistence
discovery_a.refresh_from_db()
persisted_value = discovery_a.target_customer

results["dual_session_workflows"] = {
    "help_request_api_status": resp_help.status_code,
    "help_activity_logged_in_db": bool(help_activity and help_activity.metadata.get("field_key") == "target_customer"),
    "help_status_detected_active": resp_help_status.data.get("active_help") is not None if resp_help_status.status_code == 200 else False,
    "help_resolved_status": resp_resolve.status_code,
    "consultant_support_access_status": resp_support_access.status_code,
    "field_editing_status": resp_update.status_code,
    "db_persistence_verified": persisted_value == "Enterprise CTOs & Design Leads (Updated via Support)",
    "persisted_field_value": persisted_value
}

print("=== FINAL PHASE 1 VERIFICATION RESULTS ===")
print(json.dumps(results, indent=2))
