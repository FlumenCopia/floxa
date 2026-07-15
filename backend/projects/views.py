import base64
import logging
import threading
from datetime import datetime

from django.http import FileResponse
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.mail import EmailMessage, send_mail
from django.contrib.auth.hashers import check_password
from django.core import signing
from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from accounts.authentication import CookieOrHeaderJWTAuthentication

from .models import (
    Agreement,
    BrandDNA,
    ClientProfile,
    Concept,
    Deliverable,
    DiscoveryCompetitor,
    DiscoveryEmotion,
    DiscoverySliderResponse,
    DiscoveryVisualStyle,
    GeneratedAgreementSnapshot,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectAgreement,
    ProjectAgreementAppendix,
    ProjectActivity,
    ProjectDiscovery,
)
from .serializers import (
    BrandDNASerializer,
    ClientPortalActivitySerializer,
    ClientPortalAgreementSerializer,
    ClientPortalBrandDNASerializer,
    ClientPortalConceptSerializer,
    ClientPortalDeliverableSerializer,
    ClientPortalMoodboardSerializer,
    ClientPortalPaymentMilestoneSerializer,
    ClientPortalProjectSerializer,
    ClientProfileSerializer,
    ConsultantAgreementSerializer,
    ConsultantConceptSerializer,
    ConsultantDeliverableSerializer,
    DiscoverySummarySerializer,
    MoodboardSerializer,
    PaymentMilestoneSerializer,
    ProjectActivitySerializer,
    ProjectCreateSerializer,
    ProjectDiscoverySerializer,
    ProjectSerializer,
)
from .progress import calculate_project_progress, calculate_project_workflow_status


logger = logging.getLogger(__name__)

PORTAL_ACCESS_COOKIE_NAME = "floxa_portal_access"
PORTAL_ACCESS_MAX_AGE = 60 * 60 * 24
PORTAL_ACCESS_SALT = "floxa.client-portal-access"


def sign_portal_access_token(portal_token):
    return signing.TimestampSigner(salt=PORTAL_ACCESS_SALT).sign(str(portal_token))


def is_verified_client_portal_access(request, portal_token):
    signed_value = request.COOKIES.get(PORTAL_ACCESS_COOKIE_NAME)

    if not signed_value:
        return False

    try:
        value = signing.TimestampSigner(salt=PORTAL_ACCESS_SALT).unsign(
            signed_value,
            max_age=PORTAL_ACCESS_MAX_AGE,
        )
    except signing.BadSignature:
        return False

    return value == str(portal_token)


class ClientPortalAccessPermission(BasePermission):
    message = "Portal password verification required."

    def has_permission(self, request, view):
        portal_token = view.kwargs.get("portal_token")
        return bool(portal_token and is_verified_client_portal_access(request, portal_token))


def send_client_portal_invite(project, raw_portal_password):
    portal_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/client/{project.portal_token}"
    subject = f"Your FLOXA portal is ready for {project.company_name}"
    message = (
        f"Hello {project.client.name},\n\n"
        f"Your project workspace is ready.\n\n"
        f"Project: {project.company_name}\n"
        f"Portal link: {portal_link}\n"
        f"Temporary portal password: {raw_portal_password}\n\n"
        "Please keep this password private and do not share it outside your project team.\n\n"
        "FLOXA"
    )

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [project.client.email],
        fail_silently=False,
    )


def send_client_portal_invite_background(project_id, raw_portal_password):
    def send_invite():
        try:
            project = Project.objects.select_related("client").get(id=project_id)
            send_client_portal_invite(project, raw_portal_password)
        except Exception:
            logger.exception(
                "Client portal invite email failed for project_id=%s.",
                project_id,
            )

    thread = threading.Thread(
        target=send_invite,
        name=f"floxa-project-invite-{project_id}",
        daemon=True,
    )
    thread.start()


def send_project_agreement_share_email(project, agreement):
    profile = get_project_profile(project)
    client_name = profile.client_name if profile and profile.client_name else project.client.name
    client_email = profile.email if profile and profile.email else project.client.email
    agreement_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/client/{project.portal_token}?agreement=1"
    is_signed_update = bool(agreement.signed_at)
    subject = f"Agreement updated - {project.company_name}" if is_signed_update else f"Agreement ready for review - {project.company_name}"
    action_message = (
        "Your signed agreement has been updated with the latest project evidence."
        if is_signed_update
        else "Your agreement is ready to review and sign."
    )
    next_step_message = (
        "Please review or download the latest agreement for your records."
        if is_signed_update
        else "Please review the agreement carefully and complete the signature step when ready."
    )
    message = (
        f"Hello {client_name},\n\n"
        f"{action_message}\n\n"
        f"Project: {project.company_name}\n"
        f"Agreement link: {agreement_link}\n\n"
        f"{next_step_message}\n\n"
        "FLOXA"
    )

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [client_email],
        fail_silently=False,
    )

    return agreement_link


def send_project_agreement_signature_request_email(project, agreement):
    profile = get_project_profile(project)
    client_name = profile.client_name if profile and profile.client_name else project.client.name
    client_email = profile.email if profile and profile.email else project.client.email
    agreement_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/client/{project.portal_token}?agreement=1"
    subject = f"Signature requested - {project.company_name}"
    message = (
        f"Hello {client_name},\n\n"
        f"Please review and sign the basic agreement for {project.company_name}.\n\n"
        f"Project: {project.company_name}\n"
        f"Agreement link: {agreement_link}\n\n"
        "Open the secure portal link, review the PDF, and finish signing when ready.\n\n"
        "FLOXA"
    )

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [client_email],
        fail_silently=False,
    )

    return agreement_link


def get_client_evidence_metadata(project):
    return {
        "client_id": project.client_id,
        "client_name": project.client.name,
        "company_name": project.company_name,
    }


def serialize_datetime(value):
    return value.isoformat() if value else None


def get_request_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.META.get("REMOTE_ADDR", "")


def serialize_decimal(value):
    return str(value) if value is not None else "0"


def get_project_profile(project):
    try:
        return project.client_profile
    except ClientProfile.DoesNotExist:
        return None


def build_discovery_snapshot(discovery):
    return {
        "id": discovery.id,
        "what_business_does": discovery.what_business_does,
        "target_customer": discovery.target_customer,
        "why_choose_us": discovery.why_choose_us,
        "brand_feeling": discovery.brand_feeling,
        "audience_archetype": discovery.audience_archetype,
        "emotions": [item.emotion for item in discovery.emotions.all()],
        "visual_styles": [item.style for item in discovery.visual_styles.all()],
        "competitors": [
            {
                "id": item.id,
                "name": item.name,
                "rating": item.rating,
                "reason": item.reason,
            }
            for item in discovery.competitors.all()
        ],
        "updated_at": serialize_datetime(discovery.updated_at),
    }


def build_agreement_snapshot(project, generated_at, version):
    profile = get_project_profile(project)
    discovery = project.discovery
    brand_dna = getattr(project, "brand_dna", None)
    selected_moodboard = project.moodboards.filter(is_selected=True).first()
    approved_concepts = project.concepts.filter(
        status=Concept.Status.APPROVED,
    ).order_by("created_at")
    requested_concepts = project.concepts.filter(
        status=Concept.Status.CHANGES_REQUESTED,
    ).order_by("created_at")
    evidence_actions = [
        "discovery_submitted",
        "discovery_updated",
        "moodboard_selected",
        "concept_approved",
        "concept_changes_requested",
        "agreement_shared",
        "agreement_downloaded",
        "agreement_accepted",
        "project_signed_off",
    ]
    evidence = [
        {
            "id": activity.id,
            "actor_type": activity.actor_type,
            "action": activity.action,
            "description": activity.description,
            "created_at": serialize_datetime(activity.created_at),
            "metadata": activity.metadata,
        }
        for activity in project.activities.filter(
            action__in=evidence_actions,
        ).order_by("created_at")
    ]
    approval_activities = {
        activity.metadata.get("concept_id"): activity
        for activity in project.activities.filter(
            action="concept_approved",
        ).order_by("created_at")
    }

    return {
        "version": version,
        "status": GeneratedAgreementSnapshot.Status.DRAFT,
        "generated_at": serialize_datetime(generated_at),
        "project": {
            "id": project.id,
            "title": project.title,
            "company_name": project.company_name,
            "sector": project.sector,
            "project_value": serialize_decimal(project.project_value),
            "created_at": serialize_datetime(project.created_at),
        },
        "client": {
            "id": project.client_id,
            "name": profile.client_name if profile and profile.client_name else project.client.name,
            "email": profile.email if profile and profile.email else project.client.email,
            "company_name": profile.company_name if profile and profile.company_name else project.company_name,
            "industry": profile.industry if profile and profile.industry else project.sector,
            "phone": profile.phone if profile else "",
            "website": profile.website if profile else "",
        },
        "consultant": {
            "id": project.consultant_id,
            "name": project.consultant.name,
            "email": project.consultant.email,
            "company": getattr(project.consultant, "company", ""),
        },
        "discovery": build_discovery_snapshot(discovery),
        "brand_dna": {
            "personality_cluster": brand_dna.brand_personality_cluster if brand_dna else "",
            "business_summary": brand_dna.business_summary if brand_dna else "",
            "target_audience_summary": brand_dna.target_audience_summary if brand_dna else "",
            "positioning_summary": brand_dna.positioning_summary if brand_dna else "",
            "brand_feeling_summary": brand_dna.brand_feeling_summary if brand_dna else "",
            "visual_direction_summary": brand_dna.visual_direction_summary if brand_dna else "",
            "competitor_summary": brand_dna.competitor_summary if brand_dna else "",
        },
        "selected_moodboard": {
            "id": selected_moodboard.id,
            "title": selected_moodboard.title,
            "description": selected_moodboard.description,
            "selected_at": serialize_datetime(
                next(
                    (
                        activity.created_at
                        for activity in project.activities.filter(
                            action="moodboard_selected",
                            metadata__moodboard_id=selected_moodboard.id,
                        ).order_by("-created_at")
                    ),
                    None,
                )
            ),
        },
        "approved_concepts": [
            {
                "id": concept.id,
                "title": concept.title,
                "description": concept.description,
                "version": concept.version,
                "status": concept.status,
                "feedback": concept.client_feedback,
                "approved_at": serialize_datetime(
                    approval_activities.get(concept.id).created_at
                    if approval_activities.get(concept.id)
                    else concept.updated_at
                ),
            }
            for concept in approved_concepts
        ],
        "requested_concept_revisions": [
            {
                "id": concept.id,
                "title": concept.title,
                "version": concept.version,
                "status": concept.status,
                "feedback": concept.client_feedback,
            }
            for concept in requested_concepts
        ],
        "approval_evidence_timeline": evidence,
        "payment_milestones": [
            {
                "id": milestone.id,
                "type": milestone.type,
                "percentage": milestone.percentage,
                "amount": serialize_decimal(milestone.amount),
                "status": milestone.status,
                "requested_at": serialize_datetime(milestone.requested_at),
                "paid_at": serialize_datetime(milestone.paid_at),
            }
            for milestone in project.payment_milestones.order_by("created_at")
        ],
        "expected_deliverables": [
            {
                "id": deliverable.id,
                "title": deliverable.title,
                "description": deliverable.description,
                "status": deliverable.status,
            }
            for deliverable in project.deliverables.order_by("created_at")
        ],
    }


def agreement_snapshot_core(snapshot):
    return {
        key: value
        for key, value in snapshot.items()
        if key not in ["generated_at", "version"]
    }


def maybe_generate_agreement_snapshot(project):
    if project.generated_agreement_snapshots.filter(
        status__in=[
            GeneratedAgreementSnapshot.Status.ACCEPTED,
            GeneratedAgreementSnapshot.Status.LOCKED,
        ],
    ).exists():
        return None

    try:
        discovery = project.discovery
    except ProjectDiscovery.DoesNotExist:
        return None

    if not is_complete_discovery_snapshot(get_discovery_snapshot(discovery)):
        return None

    if not project.moodboards.filter(is_selected=True).exists():
        return None

    if not project.concepts.filter(status=Concept.Status.APPROVED).exists():
        return None

    latest_draft = project.generated_agreement_snapshots.filter(
        status=GeneratedAgreementSnapshot.Status.DRAFT,
    ).order_by("-version").first()
    next_version = (latest_draft.version + 1) if latest_draft else 1
    generated_at = timezone.now()
    snapshot = build_agreement_snapshot(project, generated_at, next_version)

    if latest_draft and agreement_snapshot_core(latest_draft.snapshot) == agreement_snapshot_core(snapshot):
        return latest_draft

    draft = GeneratedAgreementSnapshot.objects.create(
        project=project,
        version=next_version,
        status=GeneratedAgreementSnapshot.Status.DRAFT,
        snapshot=snapshot,
        generated_at=generated_at,
    )

    ProjectActivity.objects.create(
        project=project,
        consultant=project.consultant,
        actor_type=ProjectActivity.ActorType.SYSTEM,
        action="agreement_draft_generated",
        description=f"System generated agreement draft v{draft.version}.",
        metadata={
            "generated_agreement_snapshot_id": draft.id,
            "version": draft.version,
            "status": draft.status,
        },
    )

    return draft


def append_section(lines, title, items):
    lines.append(title.upper())
    lines.append("-" * len(title))

    for item in items:
        if item:
            lines.append(str(item))

    lines.append("")


def format_snapshot_datetime(value):
    if not value:
        return "-"

    return str(value).replace("T", " ")


def format_agreement_date(value):
    if not value:
        return "-"

    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return "-"

    value = timezone.localtime(value) if timezone.is_aware(value) else value
    return value.strftime("%d %B %Y")


def format_agreement_time(value):
    if not value:
        return "-"

    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return "-"

    value = timezone.localtime(value) if timezone.is_aware(value) else value
    return value.strftime("%I:%M %p")


def get_appendix_pdf_details(appendix):
    content = appendix.content or {}
    metadata = content.get("metadata") or {}
    event_type = appendix.event_type
    title = appendix.title

    if event_type in ["discovery_submitted", "discovery_updated"]:
        return {
            "heading": "Discovery Completed",
            "lines": ["Discovery questionnaire completed."],
            "verb": "Completed on:",
        }

    if event_type == "brand_dna_generated":
        return {
            "heading": "Brand DNA Generated",
            "lines": ["Brand DNA generated."],
            "verb": "Generated on:",
        }

    if event_type == "moodboard_selected":
        moodboard_title = metadata.get("moodboard_title") or "Selected moodboard"
        return {
            "heading": "Moodboard Approval",
            "lines": ["Client selected moodboard:", moodboard_title],
            "verb": "Approved on:",
        }

    if event_type == "concept_approved":
        concept_title = metadata.get("concept_title") or "Approved concept"
        return {
            "heading": "Concept Approval",
            "lines": ["Client approved concept:", concept_title],
            "verb": "Approved on:",
        }

    if event_type == "concept_changes_requested":
        concept_title = metadata.get("concept_title") or "Concept"
        feedback = metadata.get("feedback")
        lines = ["Client requested revisions for concept:", concept_title]

        if feedback:
            lines.extend(["Client feedback:", feedback])

        return {
            "heading": "Concept Revision Request",
            "lines": lines,
            "verb": "Requested on:",
        }

    if event_type in ["deliverable_shared", "deliverable_reshared"]:
        deliverable_title = metadata.get("deliverable_title")
        lines = ["Deliverables shared with client."]

        if deliverable_title:
            lines.extend(["Deliverable:", deliverable_title])

        return {
            "heading": "Deliverables Shared",
            "lines": lines,
            "verb": "Shared on:",
        }

    if event_type == "deliverable_downloaded":
        deliverable_title = metadata.get("deliverable_title")
        lines = ["Deliverables downloaded by client."]

        if deliverable_title:
            lines.extend(["Deliverable:", deliverable_title])

        return {
            "heading": "Deliverables Downloaded",
            "lines": lines,
            "verb": "Downloaded on:",
        }

    if event_type == "project_signed_off":
        return {
            "heading": "Project Sign-Off",
            "lines": ["Project signed off by client."],
            "verb": "Signed off on:",
        }

    return {
        "heading": title,
        "lines": [content.get("timeline_entry") or title],
        "verb": "Recorded on:",
    }


def build_generated_agreement_pdf_lines(snapshot):
    lines = [
        "FLOXA GENERATED AGREEMENT",
        f"Agreement version: {snapshot.get('version', '-')}",
        f"Agreement status: {snapshot.get('status', 'draft')}",
        f"Generated at: {format_snapshot_datetime(snapshot.get('generated_at'))}",
        f"PDF generated at: {format_snapshot_datetime(snapshot.get('pdf_generated_at'))}",
        "",
    ]
    project = snapshot.get("project", {})
    client = snapshot.get("client", {})
    consultant = snapshot.get("consultant", {})
    discovery = snapshot.get("discovery", {})
    brand_dna = snapshot.get("brand_dna", {})
    moodboard = snapshot.get("selected_moodboard", {})

    append_section(
        lines,
        "Project and Client",
        [
            f"Project: {project.get('title') or project.get('company_name') or '-'}",
            f"Company: {project.get('company_name') or client.get('company_name') or '-'}",
            f"Sector: {project.get('sector') or client.get('industry') or '-'}",
            f"Project value: {project.get('project_value', '-')}",
            f"Client: {client.get('name', '-')}",
            f"Client email: {client.get('email', '-')}",
            f"Client website: {client.get('website', '-')}",
        ],
    )
    append_section(
        lines,
        "Consultant",
        [
            f"Name: {consultant.get('name', '-')}",
            f"Email: {consultant.get('email', '-')}",
            f"Company: {consultant.get('company', '-')}",
        ],
    )
    append_section(
        lines,
        "Discovery Summary",
        [
            f"What the business does: {discovery.get('what_business_does', '-')}",
            f"Target customer: {discovery.get('target_customer', '-')}",
            f"Why choose us: {discovery.get('why_choose_us', '-')}",
            f"Brand feeling: {discovery.get('brand_feeling', '-')}",
            f"Audience archetype: {discovery.get('audience_archetype', '-')}",
            f"Emotions: {', '.join(discovery.get('emotions', [])) or '-'}",
            f"Visual styles: {', '.join(discovery.get('visual_styles', [])) or '-'}",
        ],
    )
    append_section(
        lines,
        "Brand DNA Summary",
        [
            f"Personality cluster: {brand_dna.get('personality_cluster', '-')}",
            f"Business: {brand_dna.get('business_summary', '-')}",
            f"Target audience: {brand_dna.get('target_audience_summary', '-')}",
            f"Positioning: {brand_dna.get('positioning_summary', '-')}",
            f"Brand feeling: {brand_dna.get('brand_feeling_summary', '-')}",
            f"Visual direction: {brand_dna.get('visual_direction_summary', '-')}",
            f"Competitors: {brand_dna.get('competitor_summary', '-')}",
        ],
    )
    append_section(
        lines,
        "Selected Moodboard",
        [
            f"Title: {moodboard.get('title', '-')}",
            f"Description: {moodboard.get('description', '-')}",
            f"Selected at: {format_snapshot_datetime(moodboard.get('selected_at'))}",
        ],
    )

    concept_lines = []
    for concept in snapshot.get("approved_concepts", []):
        concept_lines.extend(
            [
                f"Concept: {concept.get('title', '-')}",
                f"Version: {concept.get('version', '-')}",
                f"Status: {concept.get('status', '-')}",
                f"Approved at: {format_snapshot_datetime(concept.get('approved_at'))}",
                f"Feedback: {concept.get('feedback') or '-'}",
                f"Description: {concept.get('description') or '-'}",
                "",
            ]
        )
    append_section(lines, "Approved Concepts", concept_lines or ["-"])

    revision_lines = []
    for concept in snapshot.get("requested_concept_revisions", []):
        revision_lines.extend(
            [
                f"Concept: {concept.get('title', '-')}",
                f"Version: {concept.get('version', '-')}",
                f"Status: {concept.get('status', '-')}",
                f"Requested changes: {concept.get('feedback') or '-'}",
                "",
            ]
        )
    append_section(lines, "Requested Concept Revisions", revision_lines or ["-"])

    evidence_lines = [
        (
            f"{format_snapshot_datetime(item.get('created_at'))} | "
            f"{item.get('action', '-')} | {item.get('description', '-')}"
        )
        for item in snapshot.get("approval_evidence_timeline", [])
    ]
    append_section(lines, "Approval Evidence Timeline", evidence_lines or ["-"])

    payment_lines = [
        (
            f"{item.get('type', '-').title()}: {item.get('percentage', '-')}% | "
            f"Amount: {item.get('amount', '-')} | Status: {item.get('status', '-')}"
        )
        for item in snapshot.get("payment_milestones", [])
    ]
    append_section(lines, "Payment Schedule", payment_lines or ["-"])

    deliverable_lines = [
        (
            f"{item.get('title', '-')} | Status: {item.get('status', '-')} | "
            f"{item.get('description') or '-'}"
        )
        for item in snapshot.get("expected_deliverables", [])
    ]
    append_section(lines, "Expected Deliverables", deliverable_lines or ["-"])

    return lines


def wrap_pdf_line(line, max_chars=92):
    text = str(line)

    if not text:
        return [""]

    words = text.split()
    wrapped = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()

        if len(candidate) <= max_chars:
            current = candidate
        else:
            if current:
                wrapped.append(current)
            current = word

    if current:
        wrapped.append(current)

    return wrapped or [""]


def escape_pdf_text(value):
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf_stream(lines):
    stream_lines = [
        "BT",
        "/F1 10 Tf",
        "14 TL",
        "50 790 Td",
    ]
    first_line = True

    for line in lines:
        for wrapped_line in wrap_pdf_line(line):
            if not first_line:
                stream_lines.append("T*")
            stream_lines.append(f"({escape_pdf_text(wrapped_line)}) Tj")
            first_line = False

    stream_lines.append("ET")
    return "\n".join(stream_lines).encode("utf-8")


def generate_pdf_bytes(lines):
    page_line_limit = 52
    pages = [
        lines[index:index + page_line_limit]
        for index in range(0, len(lines), page_line_limit)
    ] or [["Generated agreement draft"]]
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        None,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    page_object_numbers = []

    for page_lines in pages:
        stream = build_pdf_stream(page_lines)
        content_object_number = len(objects) + 2
        page_object = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] "
            f"/Resources << /Font << /F1 3 0 R >> >> "
            f"/Contents {content_object_number} 0 R >>"
        ).encode("utf-8")
        content_object = (
            f"<< /Length {len(stream)} >>\nstream\n".encode("utf-8")
            + stream
            + b"\nendstream"
        )
        page_object_numbers.append(len(objects) + 1)
        objects.append(page_object)
        objects.append(content_object)

    kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_object_numbers)} >>".encode("utf-8")
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{index} 0 obj\n".encode("utf-8"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
    pdf.extend(b"0000000000 65535 f \n")

    for offset in offsets:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))

    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("utf-8")
    )

    return bytes(pdf)


def is_complete_client_profile(profile):
    return bool(
        profile
        and profile.client_name.strip()
        and profile.company_name.strip()
        and profile.email.strip()
    )


def get_project_agreement_payload(agreement, request=None):
    basic_pdf_url = agreement.basic_pdf_file.url if agreement.basic_pdf_file else ""
    original_signed_pdf_url = agreement.original_signed_pdf_file.url if agreement.original_signed_pdf_file else ""
    signed_pdf_url = agreement.signed_pdf_file.url if agreement.signed_pdf_file else ""
    appendices = list(agreement.appendices.order_by("created_at", "id"))
    version_history = []

    if request:
        basic_pdf_url = request.build_absolute_uri(basic_pdf_url) if basic_pdf_url else ""
        original_signed_pdf_url = request.build_absolute_uri(original_signed_pdf_url) if original_signed_pdf_url else ""
        signed_pdf_url = request.build_absolute_uri(signed_pdf_url) if signed_pdf_url else ""

    if agreement.signed_at:
        version_history.append(
            {
                "version": 1,
                "label": "Agreement v1 - Basic Agreement Signed",
                "event_type": "agreement_signed",
                "title": "Agreement signed",
                "created_at": serialize_datetime(agreement.signed_at),
            }
        )

    for index, appendix in enumerate(appendices, start=2 if agreement.signed_at else 1):
        appendix_details = get_appendix_pdf_details(appendix)
        version_history.append(
            {
                "version": index,
                "label": f"Agreement v{index} - {appendix_details['heading']}",
                "event_type": appendix.event_type,
                "title": appendix_details["heading"],
                "created_at": serialize_datetime(appendix.created_at),
            }
        )

    return {
        "id": agreement.id,
        "project": agreement.project_id,
        "status": agreement.status,
        "current_version": len(version_history) or 1,
        "last_updated_at": serialize_datetime(appendices[-1].created_at if appendices else agreement.updated_at),
        "basic_pdf_url": basic_pdf_url,
        "original_signed_pdf_url": original_signed_pdf_url,
        "signed_pdf_url": signed_pdf_url,
        "generated_at": serialize_datetime(agreement.generated_at),
        "shared_at": serialize_datetime(agreement.shared_at),
        "signature_requested_at": serialize_datetime(agreement.signature_requested_at),
        "signature_request_email_failed_at": serialize_datetime(agreement.signature_request_email_failed_at),
        "signature_request_email_error": agreement.signature_request_email_error,
        "signed_at": serialize_datetime(agreement.signed_at),
        "signed_email_failed_at": serialize_datetime(agreement.signed_email_failed_at),
        "signed_email_error": agreement.signed_email_error,
        "signer_name": agreement.signer_name,
        "signature_method": agreement.signature_method,
        "signature_metadata": agreement.signature_metadata,
        "version_history": version_history,
        "created_at": serialize_datetime(agreement.created_at),
        "updated_at": serialize_datetime(agreement.updated_at),
    }


def build_basic_project_agreement_pdf_lines(project, profile, discovery, generated_at):
    discovery_snapshot = build_discovery_snapshot(discovery)
    client_name = profile.client_name or project.client.name
    client_company = profile.company_name or project.company_name
    client_email = profile.email or project.client.email

    lines = [
        "FLOXA SERVICE AGREEMENT",
        "",
        "This agreement records the branding project carried out between the Consultant and the Client through the FLOXA platform.",
        "This document serves as the official project agreement and maintains an immutable timeline of all client approvals, selections and important workflow events.",
        "Every approval recorded below is timestamped using the server time and becomes part of this agreement history.",
        "",
        "FLOXA BASIC AGREEMENT",
        "Agreement status: draft",
        f"Generated at: {format_snapshot_datetime(serialize_datetime(generated_at))}",
        "",
    ]

    append_section(
        lines,
        "Project Details",
        [
            f"Project: {project.title or project.company_name}",
            f"Company: {project.company_name}",
            f"Sector: {project.sector}",
            f"Project value: {serialize_decimal(project.project_value)}",
            f"Created at: {format_snapshot_datetime(serialize_datetime(project.created_at))}",
        ],
    )
    append_section(
        lines,
        "Client Details",
        [
            f"Name: {client_name}",
            f"Company: {client_company}",
            f"Industry: {profile.industry or project.sector}",
            f"Email: {client_email}",
            f"Phone: {profile.phone or '-'}",
            f"Website: {profile.website or '-'}",
        ],
    )
    append_section(
        lines,
        "Consultant Details",
        [
            f"Name: {project.consultant.name}",
            f"Email: {project.consultant.email}",
            f"Company: {getattr(project.consultant, 'company', '') or '-'}",
        ],
    )
    append_section(
        lines,
        "Discovery Summary",
        [
            f"What the business does: {discovery_snapshot.get('what_business_does') or '-'}",
            f"Target customer: {discovery_snapshot.get('target_customer') or '-'}",
            f"Why choose us: {discovery_snapshot.get('why_choose_us') or '-'}",
            f"Brand feeling: {discovery_snapshot.get('brand_feeling') or '-'}",
            f"Audience archetype: {discovery_snapshot.get('audience_archetype') or '-'}",
            f"Emotions: {', '.join(discovery_snapshot.get('emotions', [])) or '-'}",
            f"Visual styles: {', '.join(discovery_snapshot.get('visual_styles', [])) or '-'}",
        ],
    )
    append_section(
        lines,
        "Terms and Conditions",
        [
            "Terms and Conditions placeholder.",
            "Final legal terms will be reviewed and maintained by the consultant before signing.",
        ],
    )
    append_section(
        lines,
        "Signature Placeholders",
        [
            "Client signature: ______________________________",
            "Client name: ___________________________________",
            "Signed date: ___________________________________",
            "Consultant signature: __________________________",
        ],
    )

    return lines


def generate_basic_project_agreement(project):
    profile = get_project_profile(project)

    if not is_complete_client_profile(profile):
        return None, {"detail": "Client profile must be complete before generating the agreement."}

    try:
        discovery = project.discovery
    except ProjectDiscovery.DoesNotExist:
        return None, {"detail": "Discovery must be complete before generating the agreement."}

    if not is_complete_discovery_snapshot(get_discovery_snapshot(discovery)):
        return None, {"detail": "Discovery must be complete before generating the agreement."}

    existing = getattr(project, "project_agreement", None)

    if existing:
        return existing, None

    generated_at = timezone.now()
    agreement = ProjectAgreement(
        project=project,
        status=ProjectAgreement.Status.DRAFT,
        generated_at=generated_at,
    )
    pdf_bytes = generate_pdf_bytes(
        build_basic_project_agreement_pdf_lines(project, profile, discovery, generated_at)
    )
    agreement.basic_pdf_file.save(
        f"project_{project.id}/basic_agreement.pdf",
        ContentFile(pdf_bytes),
        save=False,
    )
    agreement.save()

    return agreement, None


def get_client_project_agreement_payload(agreement, request):
    pdf_url = f"/api/client-portal/{agreement.project.portal_token}/agreement/pdf/"

    return {
        **get_project_agreement_payload(agreement, request),
        "title": "Basic Agreement",
        "file_url": request.build_absolute_uri(pdf_url),
        "download_url": request.build_absolute_uri(f"{pdf_url}?download=1"),
        "is_project_agreement": True,
    }


def decode_signature_image(data_url):
    if not data_url:
        return None, None

    header, separator, encoded = data_url.partition(",")
    payload = encoded if separator else data_url
    allowed_headers = {
        "data:image/png;base64": "png",
        "data:image/jpeg;base64": "jpg",
        "data:image/jpg;base64": "jpg",
        "data:image/webp;base64": "webp",
    }
    extension = "png"

    if header:
        normalized_header = header.lower().strip()

        if normalized_header not in allowed_headers:
            return None, None

        extension = allowed_headers[normalized_header]

    if len(payload) > 3 * 1024 * 1024:
        return None, None

    try:
        decoded = base64.b64decode(payload, validate=True)
    except Exception:
        return None, None

    if len(decoded) > 2 * 1024 * 1024:
        return None, None

    signatures = {
        "png": b"\x89PNG\r\n\x1a\n",
        "jpg": b"\xff\xd8\xff",
        "webp": b"RIFF",
    }

    if not decoded.startswith(signatures[extension]):
        return None, None

    if extension == "webp" and decoded[8:12] != b"WEBP":
        return None, None

    return ContentFile(decoded), extension


def get_project_agreement_version(agreement):
    return agreement.appendices.count() + (1 if agreement.signed_at else 1)


def build_signature_audit_lines(agreement):
    metadata = agreement.signature_metadata or {}
    return [
        "",
        "SIGNATURE AUDIT CERTIFICATE",
        "---------------------------",
        f"Agreement version: v{metadata.get('agreement_version') or get_project_agreement_version(agreement)}",
        f"Legal name: {agreement.signer_name or '-'}",
        f"Email: {metadata.get('client_email') or agreement.project.client.email}",
        f"Signature type: {agreement.signature_method or '-'}",
        f"Date: {format_agreement_date(agreement.signed_at)}",
        f"Time: {format_agreement_time(agreement.signed_at)}",
        f"IP: {metadata.get('ip_address') or '-'}",
        f"User-Agent: {metadata.get('user_agent') or '-'}",
        "Signature applied to all client signature fields in the agreement template.",
    ]


def build_signed_project_agreement_pdf_lines(agreement):
    project = agreement.project
    profile = get_project_profile(project)
    discovery = project.discovery
    signed_at = agreement.signed_at or timezone.now()
    lines = build_basic_project_agreement_pdf_lines(
        project,
        profile,
        discovery,
        agreement.generated_at or signed_at,
    )
    signature_label = (
        f"{agreement.signer_name} | {agreement.get_signature_method_display()} signature | "
        f"{format_snapshot_datetime(serialize_datetime(signed_at))}"
    )

    signed_lines = []

    for line in lines:
        if line.startswith("Client signature:"):
            signed_lines.append(f"Client signature: {signature_label}")
        elif line.startswith("Client name:"):
            signed_lines.append(f"Client name: {agreement.signer_name}")
        elif line.startswith("Signed date:"):
            signed_lines.append(f"Signed date: {format_snapshot_datetime(serialize_datetime(signed_at))}")
        else:
            signed_lines.append(line)

    signed_lines.extend(build_signature_audit_lines(agreement))

    appendices = agreement.appendices.order_by("created_at", "id")

    for index, appendix in enumerate(appendices, start=2):
        details = get_appendix_pdf_details(appendix)
        signed_lines.extend(
            [
                "",
                "--------------------------------",
                f"APPENDIX {index}",
                details["heading"],
                "--------------------------------",
                "",
            ]
        )

        signed_lines.extend(details["lines"])
        signed_lines.extend(
            [
                "",
                details["verb"],
                format_agreement_date(appendix.created_at),
                format_agreement_time(appendix.created_at),
                "",
                "Recorded automatically by the FLOXA workflow.",
            ]
        )

    return signed_lines


def save_signed_project_agreement_pdf(agreement):
    pdf_bytes = generate_pdf_bytes(build_signed_project_agreement_pdf_lines(agreement))

    if agreement.signed_at and not agreement.original_signed_pdf_file and not agreement.appendices.exists():
        agreement.original_signed_pdf_file.save(
            f"project_{agreement.project_id}/original_signed_agreement.pdf",
            ContentFile(pdf_bytes),
            save=False,
        )

    agreement.signed_pdf_file.save(
        f"project_{agreement.project_id}/signed_agreement.pdf",
        ContentFile(pdf_bytes),
        save=False,
    )
    agreement.save(update_fields=["original_signed_pdf_file", "signed_pdf_file", "updated_at"])
    return agreement


def append_project_agreement_evidence(project, event_type, title, metadata=None, source_activity=None, event_key=""):
    try:
        agreement = project.project_agreement
    except ProjectAgreement.DoesNotExist:
        return None

    if not agreement.signed_at:
        return None

    if not event_key and source_activity:
        event_key = f"activity:{source_activity.id}"

    if event_key and agreement.appendices.filter(event_type=event_type, event_key=event_key).exists():
        return None

    if source_activity and agreement.appendices.filter(source_activity=source_activity).exists():
        return None

    profile = get_project_profile(project)
    created_at = timezone.now()
    content = {
        "project": {
            "id": project.id,
            "name": project.title or project.company_name,
            "company_name": project.company_name,
        },
        "client": {
            "id": project.client_id,
            "name": profile.client_name if profile and profile.client_name else project.client.name,
            "email": profile.email if profile and profile.email else project.client.email,
        },
        "consultant": {
            "id": project.consultant_id,
            "name": project.consultant.name,
            "email": project.consultant.email,
        },
        "server_datetime": serialize_datetime(created_at),
        "metadata": metadata or {},
        "timeline_entry": source_activity.description if source_activity else title,
        "source_activity_id": source_activity.id if source_activity else None,
    }
    next_version = agreement.appendices.count() + 2
    appendix = ProjectAgreementAppendix.objects.create(
        agreement=agreement,
        event_type=event_type,
        event_key=event_key,
        title=title,
        content=content,
        source_activity=source_activity,
        pdf_page_number=next_version,
    )

    if event_type == "project_signed_off":
        agreement.status = ProjectAgreement.Status.COMPLETED
    elif agreement.status == ProjectAgreement.Status.SIGNED:
        agreement.status = ProjectAgreement.Status.ACTIVE

    agreement.save(update_fields=["status", "updated_at"])
    save_signed_project_agreement_pdf(agreement)

    return appendix


def append_existing_agreement_evidence_after_signing(project, agreement):
    evidence_actions = [
        ("discovery_submitted", "Discovery completed"),
        ("discovery_updated", "Discovery updated"),
    ]

    for action, title in evidence_actions:
        activity = project.activities.filter(action=action).order_by("-created_at").first()

        if activity:
            append_project_agreement_evidence(
                project,
                action,
                title,
                metadata=activity.metadata,
                source_activity=activity,
            )


def send_signed_project_agreement_email(agreement):
    project = agreement.project
    profile = get_project_profile(project)
    client_name = profile.client_name if profile and profile.client_name else project.client.name
    client_email = profile.email if profile and profile.email else project.client.email
    subject = f"Signed agreement - {project.company_name}"
    message = (
        f"Hello,\n\n"
        f"The agreement for {project.company_name} has been signed by {client_name}.\n\n"
        f"Signed at: {format_snapshot_datetime(serialize_datetime(agreement.signed_at))}\n\n"
        "The signed PDF is attached for your records.\n\n"
        "FLOXA"
    )
    email = EmailMessage(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [client_email, project.consultant.email],
    )

    if agreement.signed_pdf_file:
        email.attach(
            "signed-agreement.pdf",
            agreement.signed_pdf_file.read(),
            "application/pdf",
        )

    email.send(fail_silently=False)


def save_agreement_snapshot_pdf(snapshot):
    generated_at = timezone.now()
    snapshot.snapshot = {
        **snapshot.snapshot,
        "status": snapshot.status,
        "pdf_generated_at": serialize_datetime(generated_at),
    }
    pdf_bytes = generate_pdf_bytes(build_generated_agreement_pdf_lines(snapshot.snapshot))
    file_name = f"project_{snapshot.project_id}/agreement_v{snapshot.version}.pdf"
    snapshot.pdf_file.save(file_name, ContentFile(pdf_bytes), save=False)
    snapshot.pdf_generated_at = generated_at
    snapshot.save(update_fields=["snapshot", "pdf_file", "pdf_generated_at", "updated_at"])

    return snapshot


def generate_agreement_snapshot_pdf(snapshot):
    if snapshot.status != GeneratedAgreementSnapshot.Status.DRAFT:
        raise ValueError("Only draft generated agreements can be regenerated.")

    return save_agreement_snapshot_pdf(snapshot)


def get_latest_generated_agreement_snapshot(project):
    return project.generated_agreement_snapshots.order_by("-version").first()


def is_generated_agreement_shared(snapshot):
    if snapshot is None:
        return False

    if snapshot.status == GeneratedAgreementSnapshot.Status.ACCEPTED:
        return True

    return snapshot.project.activities.filter(
        action="agreement_shared",
        metadata__agreement_version=snapshot.version,
    ).exists()


def get_generated_agreement_history(project):
    return [
        {
            "id": item.id,
            "version": item.version,
            "status": item.status,
            "generated_at": serialize_datetime(item.generated_at),
            "pdf_generated_at": serialize_datetime(item.pdf_generated_at),
            "accepted_at": serialize_datetime(item.accepted_at),
            "shared": is_generated_agreement_shared(item),
        }
        for item in project.generated_agreement_snapshots.order_by("-version")
    ]


def get_generated_agreement_payload(snapshot, pdf_url=""):
    if snapshot is None:
        return None

    return {
        "id": snapshot.id,
        "version": snapshot.version,
        "status": snapshot.status,
        "generated_at": serialize_datetime(snapshot.generated_at),
        "pdf_generated_at": serialize_datetime(snapshot.pdf_generated_at),
        "accepted_at": serialize_datetime(snapshot.accepted_at),
        "pdf_url": pdf_url,
        "shared": is_generated_agreement_shared(snapshot),
        "history": get_generated_agreement_history(snapshot.project),
    }


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
            raw_portal_password = serializer.validated_data["portal_password"]
            project = serializer.save()
            response_serializer = ProjectSerializer(project)
            response_data = response_serializer.data

            send_client_portal_invite_background(project.id, raw_portal_password)

            return Response(
                response_data,
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ProjectAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get_month_start(self, value, months_ago=0):
        month = value.month - months_ago
        year = value.year

        while month <= 0:
            month += 12
            year -= 1

        return value.replace(
            year=year,
            month=month,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

    def get(self, request):
        projects = Project.objects.filter(
            consultant=request.user,
            is_archived=False,
        )
        project_ids = projects.values_list("id", flat=True)
        project_totals = projects.aggregate(
            average_project_value=Avg("project_value"),
        )
        payment_totals = PaymentMilestone.objects.filter(
            project_id__in=project_ids,
        ).aggregate(
            total_paid_revenue=Sum(
                "amount",
                filter=Q(status=PaymentMilestone.Status.PAID),
            ),
            payment_pending_amount=Sum(
                "amount",
                filter=Q(
                    status__in=[
                        PaymentMilestone.Status.READY,
                        PaymentMilestone.Status.REQUESTED,
                    ],
                ),
            ),
        )
        sector_counts = {
            item["sector"] or "Unspecified": item["count"]
            for item in projects.values("sector").annotate(count=Count("id"))
        }
        total_projects = projects.count()
        completed_projects = projects.filter(
            Q(status=Project.Status.DELIVERED) | Q(client_signed_off=True)
        ).count()
        active_projects = projects.exclude(
            Q(status=Project.Status.DELIVERED) | Q(client_signed_off=True)
        ).count()
        project_progress = []
        progress_values = []
        status_counts = {}

        for project in projects.order_by("-created_at"):
            progress = calculate_project_progress(project)
            workflow_status = calculate_project_workflow_status(project)
            status_counts[workflow_status] = status_counts.get(workflow_status, 0) + 1
            progress_values.append(progress)
            project_progress.append(
                {
                    "id": project.id,
                    "name": project.title or project.company_name,
                    "progress": progress,
                    "workflow_status": workflow_status,
                }
            )

        average_project_progress = (
            round(sum(progress_values) / len(progress_values), 2)
            if progress_values
            else 0
        )
        now = timezone.now()
        revenue_last_6_months = []

        for offset in range(5, -1, -1):
            month_start = self.get_month_start(now, offset)
            month_end = self.get_month_start(now, offset - 1) if offset else now
            amount = PaymentMilestone.objects.filter(
                project_id__in=project_ids,
                status=PaymentMilestone.Status.PAID,
                paid_at__gte=month_start,
                paid_at__lt=month_end,
            ).aggregate(total=Sum("amount"))["total"] or 0
            revenue_last_6_months.append(
                {
                    "label": month_start.strftime("%b"),
                    "amount": amount,
                }
            )

        return Response(
            {
                "total_projects": total_projects,
                "active_projects": active_projects,
                "completed_projects": completed_projects,
                "average_project_progress": average_project_progress,
                "average_project_value": project_totals["average_project_value"] or 0,
                "total_paid_revenue": payment_totals["total_paid_revenue"] or 0,
                "payment_pending_amount": payment_totals["payment_pending_amount"] or 0,
                "project_status_counts": status_counts,
                "project_sector_counts": sector_counts,
                "project_progress": project_progress,
                "revenue_last_6_months": revenue_last_6_months,
            },
            status=status.HTTP_200_OK,
        )


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
    permission_classes = [ClientPortalAccessPermission]

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


class ClientPortalPasswordVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, portal_token):
        password = request.data.get("password", "")

        if not password:
            return Response(
                {"detail": "Portal password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        if not check_password(password, project.portal_password_hash):
            return Response(
                {"detail": "Incorrect portal password."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response = Response({"success": True}, status=status.HTTP_200_OK)
        response.set_cookie(
            PORTAL_ACCESS_COOKIE_NAME,
            sign_portal_access_token(portal_token),
            max_age=PORTAL_ACCESS_MAX_AGE,
            httponly=True,
            secure=settings.AUTH_COOKIE_SECURE,
            samesite=settings.AUTH_COOKIE_SAMESITE,
            path="/",
        )

        return response


class ClientPortalLogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request, portal_token):
        response = Response({"success": True}, status=status.HTTP_200_OK)
        response.delete_cookie(
            PORTAL_ACCESS_COOKIE_NAME,
            path="/",
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )

        return response


class ClientPortalBrandDNAView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

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
    permission_classes = [ClientPortalAccessPermission]

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
    permission_classes = [ClientPortalAccessPermission]

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

        activity_exists = project.activities.filter(
            action="moodboard_selected",
            metadata__moodboard_id=moodboard.id,
        ).exists()

        selected_activity = None

        if not activity_exists:
            selected_activity = ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CLIENT,
                action="moodboard_selected",
                description=f"Client selected moodboard: {moodboard.title}",
                metadata={
                    **get_client_evidence_metadata(project),
                    "moodboard_id": moodboard.id,
                    "moodboard_title": moodboard.title,
                },
            )
            append_project_agreement_evidence(
                project,
                "moodboard_selected",
                "Moodboard selected",
                metadata=selected_activity.metadata,
                source_activity=selected_activity,
            )
        maybe_generate_agreement_snapshot(project)

        serializer = ClientPortalMoodboardSerializer(
            moodboard,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalConceptView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

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

        concepts = project.concepts.filter(
            status__in=[
                Concept.Status.SHARED,
                Concept.Status.APPROVED,
                Concept.Status.CHANGES_REQUESTED,
            ]
        ).order_by("-created_at")
        serializer = ClientPortalConceptSerializer(
            concepts,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalConceptFeedbackView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def post(self, request, portal_token, concept_id):
        try:
            project = Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
            concept = project.concepts.get(
                id=concept_id,
                status__in=[
                    Concept.Status.SHARED,
                    Concept.Status.APPROVED,
                    Concept.Status.CHANGES_REQUESTED,
                ],
            )
        except (Project.DoesNotExist, Concept.DoesNotExist):
            return Response(
                {"detail": "Concept not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        action = request.data.get("action")
        feedback = (request.data.get("feedback") or "").strip()

        if action == Concept.Status.APPROVED:
            if concept.status == Concept.Status.APPROVED:
                serializer = ClientPortalConceptSerializer(
                    concept,
                    context={"request": request},
                )

                return Response(serializer.data, status=status.HTTP_200_OK)

            if concept.status not in [
                Concept.Status.SHARED,
                Concept.Status.CHANGES_REQUESTED,
            ]:
                return Response(
                    {"detail": "Only shared concepts can be approved."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            concept.status = Concept.Status.APPROVED
            concept.client_feedback = ""
            activity_action = "concept_approved"
            activity_description = f"Client approved concept: {concept.title}"
            activity_metadata = {
                **get_client_evidence_metadata(project),
                "concept_id": concept.id,
                "concept_title": concept.title,
                "concept_version": concept.version,
                "concept_status": Concept.Status.APPROVED,
            }
        elif action == Concept.Status.CHANGES_REQUESTED:
            if concept.status == Concept.Status.APPROVED:
                return Response(
                    {"detail": "Approved concepts are locked and cannot receive further feedback."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if concept.status != Concept.Status.SHARED:
                return Response(
                    {"detail": "Changes can only be requested for shared concepts."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not feedback:
                return Response(
                    {"feedback": ["Feedback is required when requesting changes."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            concept.status = Concept.Status.CHANGES_REQUESTED
            concept.client_feedback = feedback
            activity_action = "concept_changes_requested"
            activity_description = f"Client requested changes for concept: {concept.title}"
            activity_metadata = {
                **get_client_evidence_metadata(project),
                "concept_id": concept.id,
                "concept_title": concept.title,
                "concept_version": concept.version,
                "concept_status": Concept.Status.CHANGES_REQUESTED,
                "feedback": feedback,
            }
        else:
            return Response(
                {"action": ["Use approved or changes_requested."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        concept.save(update_fields=["status", "client_feedback", "updated_at"])
        recalculate_payment_milestones(project)
        concept_activity = ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CLIENT,
            action=activity_action,
            description=activity_description,
            metadata=activity_metadata,
        )
        if activity_action in ["concept_approved", "concept_changes_requested"]:
            append_project_agreement_evidence(
                project,
                activity_action,
                "Concept approved" if activity_action == "concept_approved" else "Concept changes requested",
                metadata=concept_activity.metadata,
                source_activity=concept_activity,
            )
        maybe_generate_agreement_snapshot(project)
        serializer = ClientPortalConceptSerializer(
            concept,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalDeliverableView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

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

        deliverables = project.deliverables.filter(
            status=Deliverable.Status.SHARED,
        ).order_by("-created_at")
        serializer = ClientPortalDeliverableSerializer(
            deliverables,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalAgreementView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def get_project(self, portal_token):
        try:
            return Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get_agreement(self, project):
        try:
            return project.project_agreement
        except ProjectAgreement.DoesNotExist:
            return None

    def get(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = self.get_agreement(project)

        if agreement is None or not agreement.signature_requested_at:
            return Response(
                {"detail": "Agreement signature has not been requested yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            get_client_project_agreement_payload(agreement, request),
            status=status.HTTP_200_OK,
        )


class ClientPortalProjectAgreementPDFView(ClientPortalAgreementView):
    def get(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = self.get_agreement(project)

        if agreement is None or not agreement.signature_requested_at:
            return Response(
                {"detail": "Agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_file = agreement.signed_pdf_file or agreement.basic_pdf_file

        if not pdf_file:
            return Response(
                {"detail": "Agreement PDF is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            pdf_file.open("rb"),
            as_attachment=request.GET.get("download") == "1",
            filename="signed-agreement.pdf" if agreement.signed_pdf_file else "basic-agreement.pdf",
            content_type="application/pdf",
        )


class ClientPortalProjectAgreementSignView(ClientPortalAgreementView):
    def post(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = self.get_agreement(project)

        if agreement is None or not agreement.signature_requested_at:
            return Response(
                {"detail": "Agreement signature has not been requested yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if agreement.signed_at or agreement.status in [
            ProjectAgreement.Status.SIGNED,
            ProjectAgreement.Status.ACTIVE,
            ProjectAgreement.Status.COMPLETED,
        ]:
            return Response(
                {"detail": "Agreement has already been signed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        signer_name = (request.data.get("signer_name") or "").strip()
        signature_method = (request.data.get("signature_method") or "").strip()
        has_read_agreement = request.data.get("has_read_agreement") is True

        if not signer_name:
            return Response(
                {"signer_name": ["Full legal name is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not has_read_agreement:
            return Response(
                {"has_read_agreement": ["Confirm that you have read and agree to the agreement."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if signature_method not in ProjectAgreement.SignatureMethod.values:
            return Response(
                {"signature_method": ["Use typed, drawn, or uploaded."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        signature_image_data = request.data.get("signature_image") or ""
        metadata = request.data.get("signature_metadata") or {}

        if signature_method in [
            ProjectAgreement.SignatureMethod.DRAWN,
            ProjectAgreement.SignatureMethod.UPLOADED,
        ] and not signature_image_data:
            return Response(
                {"signature_image": ["Signature image is required for this method."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        signed_at = timezone.now()
        signature_version = get_project_agreement_version(agreement)
        agreement.signer_name = signer_name
        agreement.signature_method = signature_method
        agreement.signature_metadata = {
            **metadata,
            "legal_name": signer_name,
            "client_email": project.client.email,
            "agreement_version": signature_version,
            "ip_address": get_request_ip(request),
            "user_agent": request.META.get("HTTP_USER_AGENT", ""),
            "has_read_agreement": True,
            "signed_at": serialize_datetime(signed_at),
        }
        agreement.signed_at = signed_at
        agreement.status = ProjectAgreement.Status.SIGNED

        image_file, extension = decode_signature_image(signature_image_data)

        if signature_method in [
            ProjectAgreement.SignatureMethod.DRAWN,
            ProjectAgreement.SignatureMethod.UPLOADED,
        ] and not image_file:
            return Response(
                {"signature_image": ["Use a valid PNG, JPG, or WebP signature image under 2 MB."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if image_file:
            agreement.signature_image.save(
                f"project_{project.id}/signature.{extension}",
                image_file,
                save=False,
            )

        agreement.save(
            update_fields=[
                "signer_name",
                "signature_method",
                "signature_metadata",
                "signed_at",
                "status",
                "signature_image",
                "updated_at",
            ]
        )
        agreement = save_signed_project_agreement_pdf(agreement)
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CLIENT,
            action="agreement_signed",
            description=f"Client signed the agreement: {signer_name}.",
            metadata={
                **get_client_evidence_metadata(project),
                "project_agreement_id": agreement.id,
                "signer_name": signer_name,
                "signature_method": signature_method,
                "agreement_version": signature_version,
                "client_email": project.client.email,
                "ip_address": get_request_ip(request),
                "user_agent": request.META.get("HTTP_USER_AGENT", ""),
                "signed_at": serialize_datetime(signed_at),
            },
            visible_to_client=True,
        )
        append_existing_agreement_evidence_after_signing(project, agreement)
        email_failed = False
        try:
            send_signed_project_agreement_email(agreement)
            agreement.signed_email_failed_at = None
            agreement.signed_email_error = ""
            agreement.save(update_fields=["signed_email_failed_at", "signed_email_error", "updated_at"])
        except Exception as email_error:
            email_failed = True
            agreement.signed_email_failed_at = timezone.now()
            agreement.signed_email_error = str(email_error)
            agreement.save(update_fields=["signed_email_failed_at", "signed_email_error", "updated_at"])

        response_data = get_client_project_agreement_payload(agreement, request)

        if email_failed:
            response_data["email_error"] = "Agreement signed, but email could not be sent."

        return Response(response_data, status=status.HTTP_200_OK)


class ClientPortalGeneratedAgreementView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def get_project(self, portal_token):
        try:
            return Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot = get_latest_generated_agreement_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT and not is_generated_agreement_shared(snapshot):
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not snapshot.pdf_file and snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT:
            snapshot = generate_agreement_snapshot_pdf(snapshot)

        pdf_url = f"/api/client-portal/{project.portal_token}/generated-agreement/pdf/"

        return Response(
            get_generated_agreement_payload(snapshot, request.build_absolute_uri(pdf_url)),
            status=status.HTTP_200_OK,
        )


class ClientPortalGeneratedAgreementPDFView(ClientPortalGeneratedAgreementView):
    def get(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot = get_latest_generated_agreement_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT and not is_generated_agreement_shared(snapshot):
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not snapshot.pdf_file and snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT:
            snapshot = generate_agreement_snapshot_pdf(snapshot)

        if not snapshot.pdf_file:
            return Response(
                {"detail": "Generated agreement PDF is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.GET.get("download") == "1":
            downloaded_at = timezone.now()
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CLIENT,
                action="agreement_downloaded",
                description=f"Client downloaded generated agreement v{snapshot.version}.",
                metadata={
                    **get_client_evidence_metadata(project),
                    "generated_agreement_snapshot_id": snapshot.id,
                    "agreement_version": snapshot.version,
                    "downloaded_at": serialize_datetime(downloaded_at),
                },
                visible_to_client=True,
            )

        return FileResponse(
            snapshot.pdf_file.open("rb"),
            as_attachment=request.GET.get("download") == "1",
            filename=f"generated-agreement-v{snapshot.version}.pdf",
            content_type="application/pdf",
        )


class ClientPortalGeneratedAgreementAcceptView(ClientPortalGeneratedAgreementView):
    def post(self, request, portal_token):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Client portal link not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        accepted = request.data.get("accepted") is True

        if not accepted:
            return Response(
                {"accepted": ["You must confirm that you have read and accept this agreement."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        snapshot = get_latest_generated_agreement_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT and not is_generated_agreement_shared(snapshot):
            return Response(
                {"detail": "Generated agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if snapshot.status != GeneratedAgreementSnapshot.Status.DRAFT:
            return Response(
                {"detail": "Agreement has already been accepted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        accepted_at = timezone.now()
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CLIENT,
            action="agreement_accepted",
            description=f"Client accepted generated agreement v{snapshot.version}.",
            metadata={
                **get_client_evidence_metadata(project),
                "generated_agreement_snapshot_id": snapshot.id,
                "agreement_version": snapshot.version,
                "accepted_at": serialize_datetime(accepted_at),
            },
            visible_to_client=True,
        )

        snapshot.status = GeneratedAgreementSnapshot.Status.ACCEPTED
        snapshot.accepted_at = accepted_at
        snapshot.snapshot = {
            **build_agreement_snapshot(project, accepted_at, snapshot.version),
            "status": GeneratedAgreementSnapshot.Status.ACCEPTED,
            "accepted_at": serialize_datetime(accepted_at),
        }
        snapshot = save_agreement_snapshot_pdf(snapshot)
        snapshot.save(update_fields=["status", "accepted_at", "snapshot", "pdf_file", "pdf_generated_at", "updated_at"])
        pdf_url = f"/api/client-portal/{project.portal_token}/generated-agreement/pdf/"

        return Response(
            get_generated_agreement_payload(snapshot, request.build_absolute_uri(pdf_url)),
            status=status.HTTP_200_OK,
        )


class ClientPortalPaymentMilestoneView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    milestone_order = {
        PaymentMilestone.Type.ADVANCE: 1,
        PaymentMilestone.Type.MID: 2,
        PaymentMilestone.Type.FINAL: 3,
    }

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

        milestones = sorted(
            project.payment_milestones.all(),
            key=lambda item: self.milestone_order.get(item.type, 99),
        )
        serializer = ClientPortalPaymentMilestoneSerializer(milestones, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalAssetDownloadView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def get_project(self, portal_token):
        try:
            return Project.objects.get(
                portal_token=portal_token,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def stream_file(self, file_field):
        if not file_field:
            return Response(
                {"detail": "File not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            file_field.open("rb"),
            as_attachment=False,
            filename=file_field.name.split("/")[-1],
        )

    def get(self, request, portal_token, asset_type, asset_id=None):
        project = self.get_project(portal_token)

        if project is None:
            return Response(
                {"detail": "Asset not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if asset_type == "moodboard-image":
            try:
                moodboard = project.moodboards.get(id=asset_id)
            except Moodboard.DoesNotExist:
                return Response(
                    {"detail": "Asset not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return self.stream_file(moodboard.image)

        if asset_type == "concept-image":
            try:
                concept = project.concepts.get(
                    id=asset_id,
                    status__in=[
                        Concept.Status.SHARED,
                        Concept.Status.APPROVED,
                        Concept.Status.CHANGES_REQUESTED,
                    ],
                )
            except Concept.DoesNotExist:
                return Response(
                    {"detail": "Asset not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return self.stream_file(concept.image)

        if asset_type == "concept-file":
            try:
                concept = project.concepts.get(
                    id=asset_id,
                    status__in=[
                        Concept.Status.SHARED,
                        Concept.Status.APPROVED,
                        Concept.Status.CHANGES_REQUESTED,
                    ],
                )
            except Concept.DoesNotExist:
                return Response(
                    {"detail": "Asset not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return self.stream_file(concept.file)

        if asset_type == "agreement-file":
            try:
                agreement = project.agreement
            except Agreement.DoesNotExist:
                return Response(
                    {"detail": "Asset not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            return self.stream_file(agreement.file)

        if asset_type == "deliverable-file":
            try:
                deliverable = project.deliverables.get(
                    id=asset_id,
                    status=Deliverable.Status.SHARED,
                )
            except Deliverable.DoesNotExist:
                return Response(
                    {"detail": "Asset not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            final_payment_paid = project.payment_milestones.filter(
                type=PaymentMilestone.Type.FINAL,
                status=PaymentMilestone.Status.PAID,
            ).exists()

            if not final_payment_paid:
                return Response(
                    {"detail": "Final payment must be completed before downloading deliverables."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            downloaded_activity = ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CLIENT,
                action="deliverable_downloaded",
                description=f"Client downloaded deliverable: {deliverable.title}",
                metadata={
                    **get_client_evidence_metadata(project),
                    "deliverable_id": deliverable.id,
                    "deliverable_title": deliverable.title,
                },
                visible_to_client=True,
            )
            append_project_agreement_evidence(
                project,
                "deliverable_downloaded",
                "Deliverable downloaded",
                metadata=downloaded_activity.metadata,
                source_activity=downloaded_activity,
                event_key=f"deliverable_downloaded:{deliverable.id}",
            )

            return self.stream_file(deliverable.file)

        return Response(
            {"detail": "Asset not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


class ClientPortalSignOffView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def post(self, request, portal_token):
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

        if project.client_signed_off:
            serializer = ClientPortalProjectSerializer(project)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if not project.deliverables.filter(status=Deliverable.Status.SHARED).exists():
            return Response(
                {"detail": "Final delivery is not available for sign-off yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paid_milestone_types = set(
            project.payment_milestones.filter(
                status=PaymentMilestone.Status.PAID,
            ).values_list("type", flat=True)
        )
        required_milestone_types = {
            PaymentMilestone.Type.ADVANCE,
            PaymentMilestone.Type.MID,
            PaymentMilestone.Type.FINAL,
        }

        if paid_milestone_types != required_milestone_types:
            return Response(
                {"detail": "All payment milestones must be paid before sign-off."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project.client_signed_off = True
        project.signed_off_at = timezone.now()
        project.status = Project.Status.DELIVERED
        project.save(update_fields=["client_signed_off", "signed_off_at", "status", "updated_at"])
        signoff_activity = ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CLIENT,
            action="project_signed_off",
            description="Client accepted the final delivery and completed the project.",
            metadata={
                **get_client_evidence_metadata(project),
                "project_id": project.id,
                "signed_off_at": project.signed_off_at.isoformat(),
                "project_status": project.status,
            },
        )
        append_project_agreement_evidence(
            project,
            "project_signed_off",
            "Project sign-off",
            metadata=signoff_activity.metadata,
            source_activity=signoff_activity,
        )
        maybe_generate_agreement_snapshot(project)

        serializer = ClientPortalProjectSerializer(project)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalActivityView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

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

        activities = project.activities.filter(
            visible_to_client=True,
        ).order_by("-created_at")
        serializer = ClientPortalActivitySerializer(activities, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)


class ClientPortalActivityMarkReadView(APIView):
    authentication_classes = []
    permission_classes = [ClientPortalAccessPermission]

    def post(self, request, portal_token):
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

        marked_read = project.activities.filter(
            visible_to_client=True,
            client_is_read=False,
        ).update(
            client_is_read=True,
            client_read_at=timezone.now(),
        )

        return Response(
            {"marked_read": marked_read},
            status=status.HTTP_200_OK,
        )


class ClientProfileView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_project(self, request, project_id):
        portal_token = request.headers.get("X-Client-Portal-Token", "").strip()

        if portal_token:
            try:
                project = Project.objects.get(
                    id=project_id,
                    is_archived=False,
                )
            except Project.DoesNotExist:
                return None

            if (
                str(project.portal_token) == portal_token
                and is_verified_client_portal_access(request, portal_token)
            ):
                return project

            return None

        authenticated = self.get_authenticated_consultant(request)

        if authenticated is None:
            return None

        try:
            return Project.objects.get(
                id=project_id,
                consultant=authenticated,
                is_archived=False,
            )
        except Project.DoesNotExist:
            return None

    def get_authenticated_consultant(self, request):
        try:
            authenticated = CookieOrHeaderJWTAuthentication().authenticate(request)
        except Exception:
            return None

        if authenticated is None:
            return None

        user, _ = authenticated
        return user

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            if request.headers.get("X-Client-Portal-Token", "").strip():
                return Response(
                    {"detail": "Portal password verification required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

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
            if request.headers.get("X-Client-Portal-Token", "").strip():
                return Response(
                    {"detail": "Portal password verification required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ClientProfileSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        existing_profile = ClientProfile.objects.filter(project=project).first()
        profile_changed = has_client_profile_changed(
            existing_profile,
            serializer.validated_data,
        )

        profile, _ = ClientProfile.objects.update_or_create(
            project=project,
            defaults=serializer.validated_data,
        )
        if profile_changed:
            create_client_profile_activity(project, profile)

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

        if (
            str(project.portal_token) != portal_token
            or not is_verified_client_portal_access(request, portal_token)
        ):
            return None

        return project

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            if request.headers.get("X-Client-Portal-Token", "").strip():
                return Response(
                    {"detail": "Portal password verification required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

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

    def save_discovery(self, request, project, mark_submitted=False):
        existing_discovery = (
            ProjectDiscovery.objects.prefetch_related(
                "sliders",
                "emotions",
                "competitors",
                "visual_styles",
            )
            .filter(project=project)
            .first()
        )

        if existing_discovery and existing_discovery.submitted_at:
            if mark_submitted:
                response_serializer = ProjectDiscoverySerializer(existing_discovery)
                return Response(response_serializer.data, status=status.HTTP_200_OK)

            return Response(
                {"detail": "Discovery has already been submitted and can no longer be edited."},
                status=status.HTTP_409_CONFLICT,
            )

        serializer = ProjectDiscoverySerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        validated_data = serializer.validated_data
        sliders = validated_data.pop("sliders", [])
        emotions = validated_data.pop("emotions", [])
        competitors = validated_data.pop("competitors", [])
        visual_styles = validated_data.pop("visual_styles", [])

        next_snapshot = get_discovery_payload_snapshot(
            validated_data,
            emotions,
            competitors,
            visual_styles,
        )

        if mark_submitted and not is_complete_discovery_snapshot(next_snapshot):
            return Response(
                {"detail": "Complete discovery answers before submitting."},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        if mark_submitted and not discovery.submitted_at:
            discovery.submitted_at = timezone.now()
            discovery.save(update_fields=["submitted_at", "updated_at"])

        if (
            mark_submitted
            and is_complete_discovery_snapshot(next_snapshot)
        ):
            discovery_activity = create_discovery_activity(project, discovery)
            append_project_agreement_evidence(
                project,
                discovery_activity.action,
                "Discovery completed" if discovery_activity.action == "discovery_submitted" else "Discovery updated",
                metadata=discovery_activity.metadata,
                source_activity=discovery_activity,
            )
            maybe_generate_agreement_snapshot(project)

        response_serializer = ProjectDiscoverySerializer(discovery)

        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            if request.headers.get("X-Client-Portal-Token", "").strip():
                return Response(
                    {"detail": "Portal password verification required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return self.save_discovery(request, project, mark_submitted=False)


class ProjectDiscoverySubmitView(ProjectDiscoveryView):
    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            if request.headers.get("X-Client-Portal-Token", "").strip():
                return Response(
                    {"detail": "Portal password verification required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return self.save_discovery(request, project, mark_submitted=True)


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
                    "sliders",
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

        if not discovery.submitted_at:
            return Response(
                {"detail": "Discovery has not been submitted by the client yet."},
                status=status.HTTP_409_CONFLICT,
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
            "discovery_updated_at": discovery.updated_at,
            "sliders": [
                {
                    "slider_key": item.slider_key,
                    "left_label": item.left_label,
                    "right_label": item.right_label,
                    "value": item.value,
                }
                for item in discovery.sliders.all()
            ],
            "top_competitors": [
                {
                    "name": item.name,
                    "rating": item.rating,
                    "reason": item.reason,
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
        activity_exists = project.activities.filter(
            action="moodboard_uploaded",
            metadata__moodboard_id=moodboard.id,
        ).exists()

        if not activity_exists:
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="moodboard_uploaded",
                description="You uploaded 1 moodboard.",
                metadata={
                    "moodboard_id": moodboard.id,
                    "moodboard_title": moodboard.title,
                    "moodboard_count": 1,
                },
            )
        response_serializer = MoodboardSerializer(
            moodboard,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ConceptView(APIView):
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

        concepts = project.concepts.order_by("-created_at")
        serializer = ConsultantConceptSerializer(
            concepts,
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

        serializer = ConsultantConceptSerializer(
            data=request.data,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        concept = serializer.save(project=project)
        activity_exists = project.activities.filter(
            action="concept_uploaded",
            metadata__concept_id=concept.id,
        ).exists()

        if not activity_exists:
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="concept_uploaded",
                description="You uploaded 1 concept.",
                metadata={
                    "concept_id": concept.id,
                    "concept_title": concept.title,
                    "concept_count": 1,
                },
            )
        response_serializer = ConsultantConceptSerializer(
            concept,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ConceptDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_concept(self, request, project_id, concept_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            return project.concepts.get(id=concept_id)
        except (Project.DoesNotExist, Concept.DoesNotExist):
            return None

    def patch(self, request, project_id, concept_id):
        concept = self.get_concept(request, project_id, concept_id)

        if concept is None:
            return Response(
                {"detail": "Concept not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if concept.status == Concept.Status.APPROVED:
            return Response(
                {"detail": "Approved concepts cannot be edited."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed_fields = {"title", "description", "image", "file"}
        update_data = {
            key: value
            for key, value in request.data.items()
            if key in allowed_fields
        }

        serializer = ConsultantConceptSerializer(
            concept,
            data=update_data,
            partial=True,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        concept = serializer.save()

        if concept.status in [
            Concept.Status.SHARED,
            Concept.Status.CHANGES_REQUESTED,
        ]:
            concept.status = Concept.Status.DRAFT
            concept.save(update_fields=["status", "updated_at"])

        recalculate_payment_milestones(concept.project)
        response_serializer = ConsultantConceptSerializer(
            concept,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, project_id, concept_id):
        concept = self.get_concept(request, project_id, concept_id)

        if concept is None:
            return Response(
                {"detail": "Concept not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if concept.status == Concept.Status.APPROVED:
            return Response(
                {"detail": "Approved concepts cannot be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        project = concept.project

        if concept.status in [
            Concept.Status.SHARED,
            Concept.Status.CHANGES_REQUESTED,
        ]:
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="concept_removed",
                description=f"A previously shared concept is no longer available: {concept.title}",
                metadata={
                    "concept_id": concept.id,
                    "concept_title": concept.title,
                },
                visible_to_client=True,
            )

        concept.delete()
        recalculate_payment_milestones(project)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ConceptShareView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, project_id, concept_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            concept = project.concepts.get(id=concept_id)
        except (Project.DoesNotExist, Concept.DoesNotExist):
            return Response(
                {"detail": "Concept not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if concept.status == Concept.Status.APPROVED:
            return Response(
                {"detail": "Approved concepts cannot be shared again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        was_previously_shared = project.activities.filter(
            visible_to_client=True,
            action__in=["concept_shared", "concept_reshared"],
            metadata__concept_id=concept.id,
        ).exists()
        activity_action = "concept_reshared" if was_previously_shared else "concept_shared"
        activity_description = (
            f"An updated concept is ready for your review: {concept.title}"
            if was_previously_shared
            else f"A new concept is ready for your review: {concept.title}"
        )

        concept.status = Concept.Status.SHARED
        concept.save(update_fields=["status", "updated_at"])
        recalculate_payment_milestones(project)
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action=activity_action,
            description=activity_description,
            metadata={
                "concept_id": concept.id,
                "concept_title": concept.title,
                "version": concept.version,
            },
            visible_to_client=True,
        )
        serializer = ConsultantConceptSerializer(
            concept,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


class DeliverableView(APIView):
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

        deliverables = project.deliverables.order_by("-created_at")
        serializer = ConsultantDeliverableSerializer(
            deliverables,
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

        serializer = ConsultantDeliverableSerializer(
            data=request.data,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        deliverable = serializer.save(project=project)
        activity_exists = project.activities.filter(
            action="deliverable_uploaded",
            metadata__deliverable_id=deliverable.id,
        ).exists()

        if not activity_exists:
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="deliverable_uploaded",
                description="You uploaded 1 deliverable.",
                metadata={
                    "deliverable_id": deliverable.id,
                    "deliverable_title": deliverable.title,
                    "deliverable_count": 1,
                },
            )
        response_serializer = ConsultantDeliverableSerializer(
            deliverable,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class DeliverableFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id, deliverable_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            deliverable = project.deliverables.get(id=deliverable_id)
        except (Project.DoesNotExist, Deliverable.DoesNotExist):
            return Response(
                {"detail": "Deliverable not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not deliverable.file:
            return Response(
                {"detail": "File not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            deliverable.file.open("rb"),
            as_attachment=False,
            filename=deliverable.file.name.split("/")[-1],
        )


class AgreementView(APIView):
    permission_classes = [IsAuthenticated]

    def get_agreement(self, project):
        try:
            return project.agreement
        except Agreement.DoesNotExist:
            return None

    def get(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = getattr(project, "project_agreement", None)

        if agreement is None:
            return Response(
                {"detail": "Agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            get_project_agreement_payload(agreement, request),
            status=status.HTTP_200_OK,
        )

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if self.get_agreement(project) is not None:
            return Response(
                {"detail": "Agreement already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ConsultantAgreementSerializer(
            data=request.data,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        agreement = serializer.save(project=project)
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_uploaded",
            description="A new service agreement is ready for review.",
            metadata={
                "agreement_id": agreement.id,
                "agreement_title": agreement.title,
            },
            visible_to_client=True,
            client_is_read=False,
        )
        response_serializer = ConsultantAgreementSerializer(
            agreement,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

    def patch(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = self.get_agreement(project)

        if agreement is None:
            return Response(
                {"detail": "Agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        allowed_fields = {"title", "file"}
        update_data = {
            key: value
            for key, value in request.data.items()
            if key in allowed_fields
        }

        serializer = ConsultantAgreementSerializer(
            agreement,
            data=update_data,
            partial=True,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        agreement = serializer.save()
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_updated",
            description="The service agreement has been updated.",
            metadata={
                "agreement_id": agreement.id,
                "agreement_title": agreement.title,
            },
            visible_to_client=True,
            client_is_read=False,
        )
        response_serializer = ConsultantAgreementSerializer(
            agreement,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = self.get_agreement(project)

        if agreement is None:
            return Response(
                {"detail": "Agreement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_removed",
            description="The service agreement is no longer available.",
            metadata={
                "agreement_id": agreement.id,
                "agreement_title": agreement.title,
            },
            visible_to_client=True,
            client_is_read=False,
        )
        agreement.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectAgreementGenerateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement, error = generate_basic_project_agreement(project)

        if error:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            get_project_agreement_payload(agreement, request),
            status=status.HTTP_200_OK,
        )


class ProjectAgreementShareView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = getattr(project, "project_agreement", None)

        if agreement is None:
            return Response(
                {"detail": "Generate the agreement before sharing it."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not agreement.basic_pdf_file:
            return Response(
                {"detail": "Agreement PDF is not available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resend = request.data.get("resend") is True

        if agreement.shared_at and not resend:
            return Response(
                {"detail": "Agreement is already shared. Use resend to email it again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        agreement_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/client/{project.portal_token}?agreement=1"
        email_failed = False

        try:
            agreement_link = send_project_agreement_share_email(project, agreement)
        except Exception as email_error:
            email_failed = True
            logger.exception(
                "Agreement share email failed for project_id=%s agreement_id=%s.",
                project.id,
                agreement.id,
            )
        shared_at = agreement.shared_at or timezone.now()
        update_fields = ["updated_at"]

        if not agreement.shared_at:
            agreement.shared_at = shared_at
            agreement.status = ProjectAgreement.Status.SHARED
            update_fields.extend(["shared_at", "status"])
            agreement.save(update_fields=update_fields)

        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_shared",
            description=(
                "Consultant resent the basic agreement to the client."
                if resend
                else "Consultant shared the basic agreement with the client."
            ),
            metadata={
                "project_agreement_id": agreement.id,
                "agreement_status": agreement.status,
                "agreement_link": agreement_link,
                "shared_at": serialize_datetime(shared_at),
                "resent": resend,
                "email_failed": email_failed,
            },
            visible_to_client=True,
            client_is_read=False,
        )

        response_data = get_project_agreement_payload(agreement, request)

        if email_failed:
            response_data["email_error"] = "Agreement shared, but email could not be sent."

        return Response(response_data, status=status.HTTP_200_OK)


class ProjectAgreementSignatureRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = getattr(project, "project_agreement", None)

        if agreement is None:
            return Response(
                {"detail": "Generate the agreement before requesting signature."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not agreement.basic_pdf_file:
            return Response(
                {"detail": "Agreement PDF is not available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if agreement.signed_at:
            return Response(
                {"detail": "Agreement has already been signed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resend = request.data.get("resend") is True

        if agreement.signature_requested_at and not resend:
            return Response(
                {"detail": "Signature has already been requested. Use resend to email it again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        requested_at = agreement.signature_requested_at or timezone.now()
        agreement_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/client/{project.portal_token}?agreement=1"

        if not agreement.signature_requested_at:
            agreement.signature_requested_at = requested_at
            agreement.status = ProjectAgreement.Status.SIGNATURE_REQUESTED
            agreement.shared_at = agreement.shared_at or requested_at

        update_fields = [
            "signature_requested_at",
            "shared_at",
            "status",
            "signature_request_email_failed_at",
            "signature_request_email_error",
            "updated_at",
        ]

        email_failed = False

        try:
            agreement_link = send_project_agreement_signature_request_email(project, agreement)
            agreement.signature_request_email_failed_at = None
            agreement.signature_request_email_error = ""
        except Exception as email_error:
            email_failed = True
            agreement.signature_request_email_failed_at = timezone.now()
            agreement.signature_request_email_error = str(email_error)

        agreement.save(update_fields=update_fields)

        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_signature_requested",
            description=(
                "Consultant resent the agreement signature request."
                if resend
                else "Consultant requested the client signature for the agreement."
            ),
            metadata={
                "project_agreement_id": agreement.id,
                "agreement_status": agreement.status,
                "agreement_version": get_project_agreement_version(agreement),
                "agreement_link": agreement_link,
                "requested_at": serialize_datetime(requested_at),
                "resent": resend,
                "email_failed": email_failed,
            },
            visible_to_client=True,
            client_is_read=False,
        )

        response_data = get_project_agreement_payload(agreement, request)

        if email_failed:
            response_data["email_error"] = "Signature request was saved, but email sending failed."

        return Response(response_data, status=status.HTTP_200_OK)


class ProjectAgreementSignedEmailRetryView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = get_project_for_consultant(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        agreement = getattr(project, "project_agreement", None)

        if agreement is None or not agreement.signed_at or not agreement.signed_pdf_file:
            return Response(
                {"detail": "Signed agreement PDF is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            send_signed_project_agreement_email(agreement)
        except Exception as email_error:
            agreement.signed_email_failed_at = timezone.now()
            agreement.signed_email_error = str(email_error)
            agreement.save(update_fields=["signed_email_failed_at", "signed_email_error", "updated_at"])
            return Response(
                {"detail": "Signed agreement is valid, but email retry failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        agreement.signed_email_failed_at = None
        agreement.signed_email_error = ""
        agreement.save(update_fields=["signed_email_failed_at", "signed_email_error", "updated_at"])

        return Response(
            get_project_agreement_payload(agreement, request),
            status=status.HTTP_200_OK,
        )


class GeneratedAgreementPDFView(APIView):
    permission_classes = [IsAuthenticated]

    def get_project(self, request, project_id):
        return get_project_for_consultant(request, project_id)

    def get_latest_snapshot(self, project):
        snapshot = get_latest_generated_agreement_snapshot(project)

        if snapshot is None:
            return None, "Generated agreement draft not found."

        return snapshot, ""

    def get_latest_draft_snapshot(self, project):
        if project.generated_agreement_snapshots.filter(
            status__in=[
                GeneratedAgreementSnapshot.Status.ACCEPTED,
                GeneratedAgreementSnapshot.Status.LOCKED,
            ],
        ).exists():
            return None, "Generated agreement is locked."

        snapshot = project.generated_agreement_snapshots.filter(
            status=GeneratedAgreementSnapshot.Status.DRAFT,
        ).order_by("-version").first()

        if snapshot is None:
            return None, "Generated agreement draft not found."

        return snapshot, ""

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot, error = self.get_latest_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": error},
                status=status.HTTP_404_NOT_FOUND if "not found" in error else status.HTTP_400_BAD_REQUEST,
            )

        if not snapshot.pdf_file and snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT:
            snapshot = generate_agreement_snapshot_pdf(snapshot)

        if not snapshot.pdf_file:
            return Response(
                {"detail": "Generated agreement PDF is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return FileResponse(
            snapshot.pdf_file.open("rb"),
            as_attachment=False,
            filename=f"generated-agreement-v{snapshot.version}.pdf",
            content_type="application/pdf",
        )


class GeneratedAgreementView(GeneratedAgreementPDFView):
    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot, error = self.get_latest_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": error},
                status=status.HTTP_404_NOT_FOUND,
            )

        pdf_url = f"/api/projects/{project.id}/generated-agreement/pdf/"

        return Response(
            get_generated_agreement_payload(snapshot, request.build_absolute_uri(pdf_url)),
            status=status.HTTP_200_OK,
        )


class GeneratedAgreementPDFRegenerateView(GeneratedAgreementPDFView):
    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot, error = self.get_latest_draft_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": error},
                status=status.HTTP_404_NOT_FOUND if "not found" in error else status.HTTP_400_BAD_REQUEST,
            )

        snapshot = generate_agreement_snapshot_pdf(snapshot)
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.SYSTEM,
            action="agreement_pdf_generated",
            description=f"System generated agreement PDF for draft v{snapshot.version}.",
            metadata={
                "generated_agreement_snapshot_id": snapshot.id,
                "version": snapshot.version,
                "pdf_file": snapshot.pdf_file.name,
            },
        )

        pdf_url = f"/api/projects/{project.id}/generated-agreement/pdf/"

        return Response(
            get_generated_agreement_payload(snapshot, request.build_absolute_uri(pdf_url)),
            status=status.HTTP_200_OK,
        )


class GeneratedAgreementShareView(GeneratedAgreementPDFView):
    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot, error = self.get_latest_snapshot(project)

        if snapshot is None:
            return Response(
                {"detail": error},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not snapshot.pdf_file and snapshot.status == GeneratedAgreementSnapshot.Status.DRAFT:
            snapshot = generate_agreement_snapshot_pdf(snapshot)

        shared_at = timezone.now()
        ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="agreement_shared",
            description=f"Consultant shared generated agreement v{snapshot.version} with the client.",
            metadata={
                "generated_agreement_snapshot_id": snapshot.id,
                "agreement_version": snapshot.version,
                "shared_at": serialize_datetime(shared_at),
                "consultant_id": project.consultant_id,
                "consultant_name": project.consultant.name,
            },
            visible_to_client=True,
        )

        pdf_url = f"/api/projects/{project.id}/generated-agreement/pdf/"

        return Response(
            get_generated_agreement_payload(snapshot, request.build_absolute_uri(pdf_url)),
            status=status.HTTP_200_OK,
        )


class PaymentMilestoneView(APIView):
    permission_classes = [IsAuthenticated]

    milestone_order = {
        PaymentMilestone.Type.ADVANCE: 1,
        PaymentMilestone.Type.MID: 2,
        PaymentMilestone.Type.FINAL: 3,
    }

    def get_project(self, request, project_id):
        return get_project_for_consultant(request, project_id)

    def get_percentages(self, project):
        return {
            PaymentMilestone.Type.ADVANCE: project.advance_percentage,
            PaymentMilestone.Type.MID: project.mid_percentage,
            PaymentMilestone.Type.FINAL: project.final_percentage,
        }

    def validate_percentages(self, project):
        percentages = self.get_percentages(project)
        total = sum(percentages.values())

        if total != 100:
            return (
                False,
                {
                    "detail": "Payment percentages must total 100%.",
                    "total": total,
                },
            )

        return True, None

    def serialize_milestones(self, project):
        milestones = sorted(
            project.payment_milestones.all(),
            key=lambda item: self.milestone_order.get(item.type, 99),
        )
        serializer = PaymentMilestoneSerializer(milestones, many=True)
        return serializer.data

    def get(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self.serialize_milestones(project), status=status.HTTP_200_OK)

    def post(self, request, project_id):
        project = self.get_project(request, project_id)

        if project is None:
            return Response(
                {"detail": "Project not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_valid, error = self.validate_percentages(project)

        if not is_valid:
            return Response(error, status=status.HTTP_400_BAD_REQUEST)

        percentages = self.get_percentages(project)
        default_statuses = {
            PaymentMilestone.Type.ADVANCE: PaymentMilestone.Status.READY,
            PaymentMilestone.Type.MID: PaymentMilestone.Status.LOCKED,
            PaymentMilestone.Type.FINAL: PaymentMilestone.Status.LOCKED,
        }

        for milestone_type in [
            PaymentMilestone.Type.ADVANCE,
            PaymentMilestone.Type.MID,
            PaymentMilestone.Type.FINAL,
        ]:
            PaymentMilestone.objects.get_or_create(
                project=project,
                type=milestone_type,
                defaults={
                    "percentage": percentages[milestone_type],
                    "status": default_statuses[milestone_type],
                },
            )

        recalculate_payment_milestones(project)

        return Response(self.serialize_milestones(project), status=status.HTTP_200_OK)


class PaymentMilestoneActionView(APIView):
    permission_classes = [IsAuthenticated]

    def get_milestone(self, request, project_id, milestone_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            return project.payment_milestones.get(id=milestone_id)
        except (Project.DoesNotExist, PaymentMilestone.DoesNotExist):
            return None

    def post(self, request, project_id, milestone_id, action):
        milestone = self.get_milestone(request, project_id, milestone_id)

        if milestone is None:
            return Response(
                {"detail": "Payment milestone not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if action == "request":
            if milestone.status != PaymentMilestone.Status.READY:
                return Response(
                    {"detail": "Only ready milestones can be requested."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            milestone.status = PaymentMilestone.Status.REQUESTED
            milestone.requested_at = timezone.now()
            milestone.save(update_fields=["status", "requested_at", "amount", "updated_at"])
            notification_exists = milestone.project.activities.filter(
                action="payment_requested",
                metadata__payment_milestone_id=milestone.id,
            ).exists()

            if not notification_exists:
                ProjectActivity.objects.create(
                    project=milestone.project,
                    consultant=milestone.project.consultant,
                    actor_type=ProjectActivity.ActorType.CONSULTANT,
                    action="payment_requested",
                    description=f"{milestone.get_type_display()} payment has been requested.",
                    metadata={
                        "payment_milestone_id": milestone.id,
                        "payment_type": milestone.type,
                    },
                    visible_to_client=True,
                    client_is_read=False,
                )
        elif action == "mark_paid":
            if milestone.status != PaymentMilestone.Status.REQUESTED:
                return Response(
                    {"detail": "Only requested milestones can be marked paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            milestone.status = PaymentMilestone.Status.PAID
            milestone.paid_at = timezone.now()
            milestone.save(update_fields=["status", "paid_at", "amount", "updated_at"])
            activity_exists = milestone.project.activities.filter(
                action="payment_received",
                metadata__payment_milestone_id=milestone.id,
            ).exists()

            if not activity_exists:
                ProjectActivity.objects.create(
                    project=milestone.project,
                    consultant=milestone.project.consultant,
                    actor_type=ProjectActivity.ActorType.CONSULTANT,
                    action="payment_received",
                    description=f"{milestone.get_type_display()} payment received.",
                    metadata={
                        "payment_milestone_id": milestone.id,
                        "payment_type": milestone.type,
                    },
                )
            recalculate_payment_milestones(milestone.project)
        else:
            return Response(
                {"detail": "Unsupported payment action."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PaymentMilestoneSerializer(milestone)

        return Response(serializer.data, status=status.HTTP_200_OK)


class DeliverableDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_deliverable(self, request, project_id, deliverable_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            return project.deliverables.get(id=deliverable_id)
        except (Project.DoesNotExist, Deliverable.DoesNotExist):
            return None

    def patch(self, request, project_id, deliverable_id):
        deliverable = self.get_deliverable(request, project_id, deliverable_id)

        if deliverable is None:
            return Response(
                {"detail": "Deliverable not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        allowed_fields = {"title", "description", "file"}
        update_data = {
            key: value
            for key, value in request.data.items()
            if key in allowed_fields
        }

        serializer = ConsultantDeliverableSerializer(
            deliverable,
            data=update_data,
            partial=True,
            context={"request": request},
        )

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        deliverable = serializer.save()

        if deliverable.status == Deliverable.Status.SHARED:
            deliverable.status = Deliverable.Status.DRAFT
            deliverable.save(update_fields=["status", "updated_at"])

        recalculate_payment_milestones(deliverable.project)
        response_serializer = ConsultantDeliverableSerializer(
            deliverable,
            context={"request": request},
        )

        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def delete(self, request, project_id, deliverable_id):
        deliverable = self.get_deliverable(request, project_id, deliverable_id)

        if deliverable is None:
            return Response(
                {"detail": "Deliverable not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        project = deliverable.project

        if deliverable.status == Deliverable.Status.SHARED:
            ProjectActivity.objects.create(
                project=project,
                consultant=project.consultant,
                actor_type=ProjectActivity.ActorType.CONSULTANT,
                action="deliverable_removed",
                description=f"A previously shared deliverable is no longer available: {deliverable.title}",
                metadata={
                    "deliverable_id": deliverable.id,
                    "deliverable_title": deliverable.title,
                },
                visible_to_client=True,
            )

        deliverable.delete()
        recalculate_payment_milestones(project)

        return Response(status=status.HTTP_204_NO_CONTENT)


class DeliverableShareView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, project_id, deliverable_id):
        try:
            project = Project.objects.get(
                id=project_id,
                consultant=request.user,
                is_archived=False,
            )
            deliverable = project.deliverables.get(id=deliverable_id)
        except (Project.DoesNotExist, Deliverable.DoesNotExist):
            return Response(
                {"detail": "Deliverable not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        was_previously_shared = project.activities.filter(
            visible_to_client=True,
            action__in=["deliverable_shared", "deliverable_reshared"],
            metadata__deliverable_id=deliverable.id,
        ).exists()
        activity_action = "deliverable_reshared" if was_previously_shared else "deliverable_shared"
        activity_description = (
            f"An updated deliverable is ready for download: {deliverable.title}"
            if was_previously_shared
            else f"A new deliverable is ready for download: {deliverable.title}"
        )

        deliverable.status = Deliverable.Status.SHARED
        deliverable.save(update_fields=["status", "updated_at"])
        recalculate_payment_milestones(project)
        deliverable_activity = ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action=activity_action,
            description=activity_description,
            metadata={
                "deliverable_id": deliverable.id,
                "deliverable_title": deliverable.title,
            },
            visible_to_client=True,
        )
        append_project_agreement_evidence(
            project,
            "deliverable_shared",
            "Deliverable shared",
            metadata=deliverable_activity.metadata,
            source_activity=deliverable_activity,
        )
        serializer = ConsultantDeliverableSerializer(
            deliverable,
            context={"request": request},
        )

        return Response(serializer.data, status=status.HTTP_200_OK)


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

        activities = project.activities.filter(is_read=False)
        actions = request.data.get("actions")

        if isinstance(actions, list):
            actions = [
                str(action).strip()
                for action in actions
                if str(action).strip()
            ]

            if actions:
                activities = activities.filter(action__in=actions)

        updated_count = activities.update(
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


def has_client_profile_changed(profile, validated_data):
    if profile is None:
        return True

    for field, value in validated_data.items():
        current_value = getattr(profile, field)

        if current_value is None:
            current_value = ""

        if value is None:
            value = ""

        if str(current_value) != str(value):
            return True

    return False


def create_client_profile_activity(project, profile):
    has_submission = project.activities.filter(
        action="client_profile_submitted",
        metadata__profile_id=profile.id,
    ).exists()
    action = "client_profile_updated" if has_submission else "client_profile_submitted"
    description = (
        "Client updated their profile."
        if has_submission
        else "Client submitted their profile."
    )

    ProjectActivity.objects.create(
        project=project,
        consultant=project.consultant,
        actor_type=ProjectActivity.ActorType.CLIENT,
        action=action,
        description=description,
        metadata={
            "profile_id": profile.id,
        },
    )


def normalize_discovery_items(items, fields):
    return sorted(
        tuple(str(item.get(field, "") or "").strip() for field in fields)
        for item in items
    )


def get_discovery_snapshot(discovery):
    if discovery is None:
        return None

    return {
        "what_business_does": discovery.what_business_does.strip(),
        "target_customer": discovery.target_customer.strip(),
        "why_choose_us": discovery.why_choose_us.strip(),
        "brand_feeling": discovery.brand_feeling.strip(),
        "audience_archetype": discovery.audience_archetype.strip(),
        "emotions": sorted(item.emotion.strip() for item in discovery.emotions.all()),
        "competitors": sorted(
            (
                item.name.strip(),
                item.rating,
                item.reason.strip(),
            )
            for item in discovery.competitors.all()
        ),
        "visual_styles": sorted(
            item.style.strip()
            for item in discovery.visual_styles.all()
        ),
    }


def get_discovery_payload_snapshot(validated_data, emotions, competitors, visual_styles):
    return {
        "what_business_does": validated_data.get("what_business_does", "").strip(),
        "target_customer": validated_data.get("target_customer", "").strip(),
        "why_choose_us": validated_data.get("why_choose_us", "").strip(),
        "brand_feeling": validated_data.get("brand_feeling", "").strip(),
        "audience_archetype": validated_data.get("audience_archetype", "").strip(),
        "emotions": sorted((item.get("emotion", "") or "").strip() for item in emotions),
        "competitors": normalize_discovery_items(
            competitors,
            ["name", "rating", "reason"],
        ),
        "visual_styles": sorted(
            (item.get("style", "") or "").strip()
            for item in visual_styles
        ),
    }


def is_complete_discovery_snapshot(snapshot):
    if not snapshot:
        return False

    required_text_fields = [
        "what_business_does",
        "target_customer",
        "why_choose_us",
        "brand_feeling",
        "audience_archetype",
    ]

    return (
        all(snapshot.get(field) for field in required_text_fields)
        and bool(snapshot.get("emotions"))
        and bool(snapshot.get("competitors"))
        and bool(snapshot.get("visual_styles"))
    )


def create_discovery_activity(project, discovery):
    has_submission = project.activities.filter(
        action="discovery_submitted",
        metadata__discovery_id=discovery.id,
    ).exists()
    action = "discovery_updated" if has_submission else "discovery_submitted"
    description = (
        "Client updated the discovery questionnaire."
        if has_submission
        else "Client submitted the discovery questionnaire."
    )

    return ProjectActivity.objects.create(
        project=project,
        consultant=project.consultant,
        actor_type=ProjectActivity.ActorType.CLIENT,
        action=action,
        description=description,
        metadata={
            **get_client_evidence_metadata(project),
            "discovery_id": discovery.id,
            "discovery_status": "complete",
        },
    )


def recalculate_payment_milestones(project):
    milestones = {
        milestone.type: milestone
        for milestone in project.payment_milestones.all()
    }

    advance = milestones.get(PaymentMilestone.Type.ADVANCE)
    mid = milestones.get(PaymentMilestone.Type.MID)
    final = milestones.get(PaymentMilestone.Type.FINAL)

    has_approved_concept = project.concepts.filter(
        status=Concept.Status.APPROVED,
    ).exists()
    has_shared_deliverable = project.deliverables.filter(
        status=Deliverable.Status.SHARED,
    ).exists()

    mid_is_unlocked = bool(
        advance
        and advance.status == PaymentMilestone.Status.PAID
        and has_approved_concept
    )
    final_is_unlocked = bool(
        mid
        and mid.status == PaymentMilestone.Status.PAID
        and has_shared_deliverable
    )

    if mid and mid.status in [
        PaymentMilestone.Status.LOCKED,
        PaymentMilestone.Status.READY,
    ]:
        next_mid_status = (
            PaymentMilestone.Status.READY
            if mid_is_unlocked
            else PaymentMilestone.Status.LOCKED
        )

        if mid.status != next_mid_status:
            mid.status = next_mid_status
            mid.save(update_fields=["status", "amount", "updated_at"])

    if final and final.status in [
        PaymentMilestone.Status.LOCKED,
        PaymentMilestone.Status.READY,
    ]:
        next_final_status = (
            PaymentMilestone.Status.READY
            if final_is_unlocked
            else PaymentMilestone.Status.LOCKED
        )

        if final.status != next_final_status:
            final.status = next_final_status
            final.save(update_fields=["status", "amount", "updated_at"])


def get_discovery_slider_insights(discovery):
    sliders = list(discovery.sliders.all())

    if not sliders:
        return "", []

    scores = []
    for slider in sliders:
        score = (float(slider.value or 50) / 100 * 6) - 3
        distance = abs(score)

        if distance < 0.5:
            cue = f"balanced between {slider.left_label} and {slider.right_label}"
        elif score < 0:
            cue = f"more {slider.left_label.lower()} than {slider.right_label.lower()}"
        else:
            cue = f"more {slider.right_label.lower()} than {slider.left_label.lower()}"

        scores.append(
            {
                "score": score,
                "distance": distance,
                "cue": cue,
            }
        )

    average = sum(item["score"] for item in scores) / len(scores)
    clusters = [
        (-3, -1.5, "Soft Minimalist"),
        (-1.5, -0.4, "Quiet Specialist"),
        (-0.4, 0.8, "Balanced Clarity"),
        (0.8, 2.1, "Bold Challenger"),
        (2.1, 4, "Electric Leader"),
    ]
    cluster = next(
        (
            name
            for minimum, maximum, name in clusters
            if average >= minimum and average < maximum
        ),
        "Bold Challenger",
    )
    cues = [
        item["cue"]
        for item in sorted(scores, key=lambda entry: entry["distance"], reverse=True)[:5]
    ]

    return cluster, cues


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
    slider_cluster, slider_cues = get_discovery_slider_insights(discovery)
    archetype = slider_cluster or discovery.audience_archetype or "Quality-focused audience"
    emotion_text = format_list(emotions, "clear, confident, and trustworthy")
    visual_text = format_list(visual_styles, "clean, intentional visual direction")
    competitor_text = format_list(competitors, "No competitor references submitted.")
    slider_text = format_list(slider_cues, "balanced, adaptable brand personality cues")

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
            f"Emotional cues to preserve include {emotion_text}. "
            f"Personality slider cues indicate {slider_text}."
        ),
        "visual_direction_summary": (
            f"Recommended visual direction: {visual_text}. "
            f"Balance the visual system around {slider_text}. "
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
                    "sliders",
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

        if not discovery.submitted_at:
            return Response(
                {"detail": "Discovery must be submitted before generating Brand DNA."},
                status=status.HTTP_409_CONFLICT,
            )

        brand_dna, _ = BrandDNA.objects.update_or_create(
            project=project,
            defaults=build_brand_dna_data(project, discovery),
        )
        brand_activity = ProjectActivity.objects.create(
            project=project,
            consultant=project.consultant,
            actor_type=ProjectActivity.ActorType.CONSULTANT,
            action="brand_dna_generated",
            description="Consultant generated Brand DNA.",
            metadata={
                "brand_dna_id": brand_dna.id,
                "personality_cluster": brand_dna.brand_personality_cluster,
            },
        )
        append_project_agreement_evidence(
            project,
            "brand_dna_generated",
            "Brand DNA generated",
            metadata=brand_activity.metadata,
            source_activity=brand_activity,
            event_key=f"brand_dna_generated:{brand_dna.id}",
        )
        serializer = BrandDNASerializer(brand_dna)

        return Response(serializer.data, status=status.HTTP_200_OK)
