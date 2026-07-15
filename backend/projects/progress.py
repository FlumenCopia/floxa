from django.core.exceptions import ObjectDoesNotExist

from .models import Concept, Deliverable, PaymentMilestone


def has_related_object(project, related_name):
    try:
        getattr(project, related_name)
        return True
    except ObjectDoesNotExist:
        return False


def has_project_agreement(project):
    return has_related_object(project, "project_agreement") or has_related_object(project, "agreement")


def has_complete_discovery(project):
    try:
        discovery = project.discovery
    except ObjectDoesNotExist:
        return False

    required_fields = [
        discovery.what_business_does,
        discovery.target_customer,
        discovery.why_choose_us,
        discovery.brand_feeling,
        discovery.audience_archetype,
    ]

    return (
        all(str(value or "").strip() for value in required_fields)
        and discovery.emotions.exists()
        and discovery.competitors.exists()
        and discovery.visual_styles.exists()
    )


def calculate_project_progress(project):
    progress = 5

    if has_related_object(project, "client_profile"):
        progress = max(progress, 10)

    if has_complete_discovery(project):
        progress = max(progress, 20)

    if has_related_object(project, "brand_dna"):
        progress = max(progress, 30)

    if project.moodboards.exists():
        progress = max(progress, 40)

    if project.moodboards.filter(is_selected=True).exists():
        progress = max(progress, 50)

    if project.concepts.filter(status__in=[Concept.Status.SHARED, Concept.Status.APPROVED]).exists():
        progress = max(progress, 60)

    if project.concepts.filter(status=Concept.Status.APPROVED).exists():
        progress = max(progress, 75)

    if has_project_agreement(project):
        progress = max(progress, 82)

    if project.deliverables.filter(status=Deliverable.Status.SHARED).exists():
        progress = max(progress, 92)

    if project.payment_milestones.filter(
        type=PaymentMilestone.Type.FINAL,
        status=PaymentMilestone.Status.PAID,
    ).exists():
        progress = max(progress, 98)

    if project.client_signed_off:
        progress = max(progress, 100)

    return progress


def calculate_project_workflow_status(project):
    if project.client_signed_off or project.status == project.Status.DELIVERED:
        return "delivered"

    if project.payment_milestones.filter(
        type=PaymentMilestone.Type.FINAL,
        status=PaymentMilestone.Status.PAID,
    ).exists():
        return "final_paid"

    if project.deliverables.filter(status=Deliverable.Status.SHARED).exists():
        return "deliverables"

    if has_project_agreement(project):
        return "agreement"

    if project.concepts.filter(
        status__in=[Concept.Status.SHARED, Concept.Status.APPROVED]
    ).exists():
        return "concepts"

    if project.moodboards.exists():
        return "moodboards"

    if has_related_object(project, "brand_dna"):
        return "brand_dna"

    if project.payment_milestones.filter(
        type=PaymentMilestone.Type.ADVANCE,
        status=PaymentMilestone.Status.PAID,
    ).exists():
        return "advance_paid"

    if project.payment_milestones.filter(
        type=PaymentMilestone.Type.ADVANCE,
        status__in=[
            PaymentMilestone.Status.READY,
            PaymentMilestone.Status.REQUESTED,
        ],
    ).exists():
        return "advance_payment"

    if (
        has_related_object(project, "client_profile")
        or has_complete_discovery(project)
    ):
        return "discovery"

    return "created"
