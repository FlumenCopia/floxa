import html
import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.http import Http404

from projects.models import (
    Concept,
    Deliverable,
    GeneratedAgreementSnapshot,
    Moodboard,
    PaymentMilestone,
    Project,
    ProjectAgreement,
)
from projects.progress import calculate_project_progress, calculate_project_workflow_status


TEXT_LIMIT = 500
SHORT_TEXT_LIMIT = 220
LIST_LIMIT = 8
ACTIVITY_LIMIT = 10

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_SPACES_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")


def build_project_context(project_id, consultant):
    """
    Build a safe, read-only project context for the AI assistant.

    The context intentionally excludes portal credentials, payment provider
    identifiers, file URLs, signature data, and internal metadata blobs.
    """

    try:
        project = (
            Project.objects.select_related(
                "client",
                "client_profile",
                "discovery",
                "brand_dna",
                "agreement",
                "project_agreement",
            )
            .prefetch_related(
                "discovery__sliders",
                "discovery__emotions",
                "discovery__competitors",
                "discovery__visual_styles",
                "moodboards",
                "concepts",
                "deliverables",
                "payment_milestones",
                "activities",
            )
            .get(id=project_id, consultant=consultant, is_archived=False)
        )
    except Project.DoesNotExist as exc:
        raise Http404("Project not found.") from exc

    progress = calculate_project_progress(project)
    workflow_status = calculate_project_workflow_status(project)

    return {
        "project": _build_project_section(project),
        "workflow": {
            "status": workflow_status,
            "progress": progress,
            "client_signed_off": bool(project.client_signed_off),
            "signed_off_at": _date_value(project.signed_off_at),
        },
        "client_profile": _build_client_profile_section(project),
        "discovery": _build_discovery_section(project),
        "brand_dna": _build_brand_dna_section(project),
        "moodboards": _build_moodboards_section(project),
        "concepts": _build_concepts_section(project),
        "agreement": _build_agreement_section(project),
        "payments": _build_payments_section(project),
        "deliverables": _build_deliverables_section(project),
        "recent_activity": _build_recent_activity_section(project),
    }


def _build_project_section(project):
    return {
        "title": _clean_text(project.title, SHORT_TEXT_LIMIT),
        "company_name": _clean_text(project.company_name, SHORT_TEXT_LIMIT),
        "sector": _clean_text(project.sector, SHORT_TEXT_LIMIT),
        "status": project.status,
        "project_value": _decimal_string(project.project_value),
        "created_at": _date_value(project.created_at),
        "updated_at": _date_value(project.updated_at),
    }


def _build_client_profile_section(project):
    profile = _optional_related(project, "client_profile")
    if not profile:
        return {"available": False}

    return {
        "available": True,
        "client_name": _clean_text(profile.client_name, SHORT_TEXT_LIMIT),
        "company_name": _clean_text(profile.company_name, SHORT_TEXT_LIMIT),
        "industry": _clean_text(profile.industry, SHORT_TEXT_LIMIT),
        "year_started": profile.year_started,
        "location": _clean_text(profile.location, SHORT_TEXT_LIMIT),
        "website": _clean_text(profile.website, SHORT_TEXT_LIMIT),
        "created_at": _date_value(profile.created_at),
        "updated_at": _date_value(profile.updated_at),
    }


def _build_discovery_section(project):
    discovery = _optional_related(project, "discovery")
    if not discovery or discovery.submitted_at is None:
        return {
            "available": bool(discovery),
            "submitted": False,
            "submitted_at": None,
        }

    return {
        "available": True,
        "submitted": True,
        "submitted_at": _date_value(discovery.submitted_at),
        "updated_at": _date_value(discovery.updated_at),
        "answers": {
            "what_business_does": _clean_text(discovery.what_business_does),
            "target_customer": _clean_text(discovery.target_customer),
            "why_choose_us": _clean_text(discovery.why_choose_us),
            "brand_feeling": _clean_text(discovery.brand_feeling),
            "audience_archetype": _clean_text(discovery.audience_archetype, SHORT_TEXT_LIMIT),
        },
        "emotions": [
            _clean_text(item.emotion, SHORT_TEXT_LIMIT)
            for item in _limited(discovery.emotions.all(), LIST_LIMIT)
        ],
        "visual_styles": [
            _clean_text(item.style, SHORT_TEXT_LIMIT)
            for item in _limited(discovery.visual_styles.all(), LIST_LIMIT)
        ],
        "sliders": [
            {
                "slider_key": _clean_text(item.slider_key, SHORT_TEXT_LIMIT),
                "left_label": _clean_text(item.left_label, SHORT_TEXT_LIMIT),
                "right_label": _clean_text(item.right_label, SHORT_TEXT_LIMIT),
                "value": item.value,
            }
            for item in _limited(discovery.sliders.all(), LIST_LIMIT)
        ],
        "competitors": [
            {
                "name": _clean_text(item.name, SHORT_TEXT_LIMIT),
                "rating": item.rating,
                "reason": _clean_text(item.reason),
            }
            for item in _limited(discovery.competitors.all(), LIST_LIMIT)
        ],
    }


def _build_brand_dna_section(project):
    brand_dna = _optional_related(project, "brand_dna")
    if not brand_dna:
        return {"available": False}

    return {
        "available": True,
        "brand_personality_cluster": _clean_text(
            brand_dna.brand_personality_cluster,
            SHORT_TEXT_LIMIT,
        ),
        "business_summary": _clean_text(brand_dna.business_summary),
        "target_audience_summary": _clean_text(brand_dna.target_audience_summary),
        "positioning_summary": _clean_text(brand_dna.positioning_summary),
        "brand_feeling_summary": _clean_text(brand_dna.brand_feeling_summary),
        "visual_direction_summary": _clean_text(brand_dna.visual_direction_summary),
        "competitor_summary": _clean_text(brand_dna.competitor_summary),
        "generated_from_discovery": bool(brand_dna.generated_from_discovery),
        "created_at": _date_value(brand_dna.created_at),
        "updated_at": _date_value(brand_dna.updated_at),
    }


def _build_moodboards_section(project):
    moodboards = sorted(project.moodboards.all(), key=lambda item: item.created_at, reverse=True)
    selected = next((item for item in moodboards if item.is_selected), None)

    return {
        "count": len(moodboards),
        "selected": _moodboard_payload(selected) if selected else None,
        "items": [_moodboard_payload(item) for item in moodboards[:LIST_LIMIT]],
    }


def _moodboard_payload(moodboard):
    return {
        "title": _clean_text(moodboard.title, SHORT_TEXT_LIMIT),
        "description": _clean_text(moodboard.description),
        "is_selected": bool(moodboard.is_selected),
        "has_image": _has_file(moodboard.image),
        "created_at": _date_value(moodboard.created_at),
        "updated_at": _date_value(moodboard.updated_at),
    }


def _build_concepts_section(project):
    concepts = sorted(project.concepts.all(), key=lambda item: item.created_at, reverse=True)

    return {
        "count": len(concepts),
        "approved_count": sum(1 for item in concepts if item.status == Concept.Status.APPROVED),
        "changes_requested_count": sum(
            1 for item in concepts if item.status == Concept.Status.CHANGES_REQUESTED
        ),
        "items": [_concept_payload(item) for item in concepts[:LIST_LIMIT]],
    }


def _concept_payload(concept):
    return {
        "title": _clean_text(concept.title, SHORT_TEXT_LIMIT),
        "description": _clean_text(concept.description),
        "version": concept.version,
        "status": concept.status,
        "client_feedback": _clean_text(concept.client_feedback),
        "has_image": _has_file(concept.image),
        "has_file": _has_file(concept.file),
        "created_at": _date_value(concept.created_at),
        "updated_at": _date_value(concept.updated_at),
    }


def _build_agreement_section(project):
    project_agreement = _optional_related(project, "project_agreement")
    legacy_agreement = _optional_related(project, "agreement")
    latest_snapshot = _latest_generated_agreement_snapshot(project)

    return {
        "project_agreement": _project_agreement_payload(project_agreement),
        "legacy_agreement": _legacy_agreement_payload(legacy_agreement),
        "latest_generated_snapshot": _generated_snapshot_payload(latest_snapshot),
    }


def _project_agreement_payload(agreement):
    if not agreement:
        return {"available": False}

    signed_statuses = {
        ProjectAgreement.Status.SIGNED,
        ProjectAgreement.Status.ACTIVE,
        ProjectAgreement.Status.COMPLETED,
    }

    return {
        "available": True,
        "status": agreement.status,
        "is_signed": bool(agreement.signed_at and agreement.status in signed_statuses),
        "has_basic_pdf": _has_file(agreement.basic_pdf_file),
        "has_original_signed_pdf": _has_file(agreement.original_signed_pdf_file),
        "has_signed_pdf": _has_file(agreement.signed_pdf_file),
        "generated_at": _date_value(agreement.generated_at),
        "shared_at": _date_value(agreement.shared_at),
        "signature_requested_at": _date_value(agreement.signature_requested_at),
        "signed_at": _date_value(agreement.signed_at),
        "created_at": _date_value(agreement.created_at),
        "updated_at": _date_value(agreement.updated_at),
    }


def _legacy_agreement_payload(agreement):
    if not agreement:
        return {"available": False}

    return {
        "available": True,
        "title": _clean_text(agreement.title, SHORT_TEXT_LIMIT),
        "has_file": _has_file(agreement.file),
        "created_at": _date_value(agreement.created_at),
        "updated_at": _date_value(agreement.updated_at),
    }


def _generated_snapshot_payload(snapshot):
    if not snapshot:
        return {"available": False}

    return {
        "available": True,
        "version": snapshot.version,
        "status": snapshot.status,
        "has_pdf": _has_file(snapshot.pdf_file),
        "generated_at": _date_value(snapshot.generated_at),
        "pdf_generated_at": _date_value(snapshot.pdf_generated_at),
        "accepted_at": _date_value(snapshot.accepted_at),
    }


def _latest_generated_agreement_snapshot(project):
    snapshots = list(project.generated_agreement_snapshots.all()[:1])
    return snapshots[0] if snapshots else None


def _build_payments_section(project):
    milestones = sorted(
        project.payment_milestones.all(),
        key=lambda item: _payment_type_order(item.type),
    )
    currency = getattr(settings, "RAZORPAY_CURRENCY", "INR") or "INR"

    return {
        "currency": currency,
        "milestones": [
            {
                "type": milestone.type,
                "label": milestone.get_type_display(),
                "percentage": milestone.percentage,
                "status": milestone.status,
                "amount": _decimal_string(milestone.amount),
                "currency": currency,
                "amount_display": _amount_display(milestone.amount, currency),
                "requested_at": _date_value(milestone.requested_at),
                "paid_at": _date_value(milestone.paid_at),
            }
            for milestone in milestones
        ],
    }


def _payment_type_order(payment_type):
    order = {
        PaymentMilestone.Type.ADVANCE: 1,
        PaymentMilestone.Type.MID: 2,
        PaymentMilestone.Type.FINAL: 3,
    }
    return order.get(payment_type, 99)


def _build_deliverables_section(project):
    deliverables = sorted(project.deliverables.all(), key=lambda item: item.created_at, reverse=True)

    return {
        "count": len(deliverables),
        "shared_count": sum(1 for item in deliverables if item.status == Deliverable.Status.SHARED),
        "items": [_deliverable_payload(item) for item in deliverables[:LIST_LIMIT]],
    }


def _deliverable_payload(deliverable):
    return {
        "title": _clean_text(deliverable.title, SHORT_TEXT_LIMIT),
        "description": _clean_text(deliverable.description),
        "status": deliverable.status,
        "has_file": _has_file(deliverable.file),
        "created_at": _date_value(deliverable.created_at),
        "updated_at": _date_value(deliverable.updated_at),
    }


def _build_recent_activity_section(project):
    activities = sorted(project.activities.all(), key=lambda item: item.created_at, reverse=True)

    return {
        "items": [
            {
                "actor_type": activity.actor_type,
                "action": _clean_text(activity.action, SHORT_TEXT_LIMIT),
                "description": _clean_text(activity.description),
                "visible_to_client": bool(activity.visible_to_client),
                "created_at": _date_value(activity.created_at),
            }
            for activity in activities[:ACTIVITY_LIMIT]
        ],
    }


def _optional_related(instance, related_name):
    try:
        return getattr(instance, related_name)
    except ObjectDoesNotExist:
        return None


def _limited(items, limit):
    return list(items[:limit])


def _clean_text(value, max_length=TEXT_LIMIT):
    if value is None:
        return ""

    text = html.unescape(str(value))
    text = _HTML_TAG_RE.sub("", text)
    text = _CONTROL_CHARS_RE.sub("", text)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(_SPACES_RE.sub(" ", line).strip() for line in text.split("\n"))
    text = _BLANK_LINES_RE.sub("\n\n", text).strip()

    return _truncate_text(text, max_length)


def _truncate_text(value, max_length):
    if max_length is None or len(value) <= max_length:
        return value

    cutoff = max(0, max_length - 3)
    shortened = value[:cutoff].rsplit(" ", 1)[0] or value[:cutoff]
    return f"{shortened.rstrip()}..."


def _date_value(value):
    return value.isoformat() if value else None


def _decimal_string(value):
    if value is None:
        return "0.00"

    try:
        amount = Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return "0.00"

    return f"{amount:.2f}"


def _amount_display(value, currency):
    amount = _decimal_string(value)
    if currency == "INR":
        return f"Rs{Decimal(amount):,.2f}"

    return f"{currency} {Decimal(amount):,.2f}"


def _has_file(value):
    return bool(getattr(value, "name", ""))
