from django.core.exceptions import ObjectDoesNotExist

from .models import Concept, Deliverable, PaymentMilestone, ProjectAgreement


def has_related_object(project, related_name):
    if related_name in project._state.fields_cache:
        return project._state.fields_cache[related_name] is not None

    try:
        getattr(project, related_name)
        return True
    except ObjectDoesNotExist:
        return False


def get_prefetched_related_list(instance, related_name):
    prefetched = getattr(instance, "_prefetched_objects_cache", {})

    if related_name not in prefetched:
        return None

    return list(prefetched[related_name])


def related_exists(instance, related_name, predicate=None):
    related_items = get_prefetched_related_list(instance, related_name)

    if related_items is not None:
        if predicate is None:
            return bool(related_items)

        return any(predicate(item) for item in related_items)

    manager = getattr(instance, related_name)

    if predicate is None:
        return manager.exists()

    return None


def has_project_agreement(project):
    return has_related_object(project, "project_agreement") or has_related_object(project, "agreement")


def has_signed_project_agreement(project):
    try:
        agreement = project.project_agreement
    except ObjectDoesNotExist:
        return False

    signed_statuses = {
        ProjectAgreement.Status.SIGNED,
        ProjectAgreement.Status.ACTIVE,
        ProjectAgreement.Status.COMPLETED,
    }

    return bool(agreement.signed_at and agreement.status in signed_statuses)


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
        and related_exists(discovery, "emotions")
        and related_exists(discovery, "competitors")
        and related_exists(discovery, "visual_styles")
    )


def calculate_project_progress(project):
    progress = 5

    if has_related_object(project, "client_profile"):
        progress = max(progress, 10)

    if has_complete_discovery(project):
        progress = max(progress, 20)

    if has_related_object(project, "brand_dna"):
        progress = max(progress, 30)

    if related_exists(project, "moodboards"):
        progress = max(progress, 40)

    has_selected_moodboard = related_exists(
        project,
        "moodboards",
        lambda moodboard: moodboard.is_selected,
    )

    if has_selected_moodboard is None:
        has_selected_moodboard = project.moodboards.filter(is_selected=True).exists()

    if has_selected_moodboard:
        progress = max(progress, 50)

    has_shared_or_approved_concept = related_exists(
        project,
        "concepts",
        lambda concept: concept.status in [Concept.Status.SHARED, Concept.Status.APPROVED],
    )

    if has_shared_or_approved_concept is None:
        has_shared_or_approved_concept = project.concepts.filter(
            status__in=[Concept.Status.SHARED, Concept.Status.APPROVED]
        ).exists()

    if has_shared_or_approved_concept:
        progress = max(progress, 60)

    has_approved_concept = related_exists(
        project,
        "concepts",
        lambda concept: concept.status == Concept.Status.APPROVED,
    )

    if has_approved_concept is None:
        has_approved_concept = project.concepts.filter(status=Concept.Status.APPROVED).exists()

    if has_approved_concept:
        progress = max(progress, 75)

    if has_signed_project_agreement(project):
        progress = max(progress, 82)

    has_shared_deliverable = related_exists(
        project,
        "deliverables",
        lambda deliverable: deliverable.status == Deliverable.Status.SHARED,
    )

    if has_shared_deliverable is None:
        has_shared_deliverable = project.deliverables.filter(status=Deliverable.Status.SHARED).exists()

    if has_shared_deliverable:
        progress = max(progress, 92)

    has_final_payment_paid = related_exists(
        project,
        "payment_milestones",
        lambda milestone: (
            milestone.type == PaymentMilestone.Type.FINAL
            and milestone.status == PaymentMilestone.Status.PAID
        ),
    )

    if has_final_payment_paid is None:
        has_final_payment_paid = project.payment_milestones.filter(
            type=PaymentMilestone.Type.FINAL,
            status=PaymentMilestone.Status.PAID,
        ).exists()

    if has_final_payment_paid:
        progress = max(progress, 98)

    if project.client_signed_off:
        progress = max(progress, 100)

    return progress


def calculate_project_workflow_status(project):
    if project.client_signed_off or project.status == project.Status.DELIVERED:
        return "delivered"

    has_final_payment_paid = related_exists(
        project,
        "payment_milestones",
        lambda milestone: (
            milestone.type == PaymentMilestone.Type.FINAL
            and milestone.status == PaymentMilestone.Status.PAID
        ),
    )

    if has_final_payment_paid is None:
        has_final_payment_paid = project.payment_milestones.filter(
            type=PaymentMilestone.Type.FINAL,
            status=PaymentMilestone.Status.PAID,
        ).exists()

    if has_final_payment_paid:
        return "final_paid"

    has_shared_deliverable = related_exists(
        project,
        "deliverables",
        lambda deliverable: deliverable.status == Deliverable.Status.SHARED,
    )

    if has_shared_deliverable is None:
        has_shared_deliverable = project.deliverables.filter(status=Deliverable.Status.SHARED).exists()

    if has_shared_deliverable:
        return "deliverables"

    if has_project_agreement(project):
        return "agreement"

    has_shared_or_approved_concept = related_exists(
        project,
        "concepts",
        lambda concept: concept.status in [Concept.Status.SHARED, Concept.Status.APPROVED],
    )

    if has_shared_or_approved_concept is None:
        has_shared_or_approved_concept = project.concepts.filter(
            status__in=[Concept.Status.SHARED, Concept.Status.APPROVED]
        ).exists()

    if has_shared_or_approved_concept:
        return "concepts"

    if related_exists(project, "moodboards"):
        return "moodboards"

    if has_related_object(project, "brand_dna"):
        return "brand_dna"

    has_advance_payment_paid = related_exists(
        project,
        "payment_milestones",
        lambda milestone: (
            milestone.type == PaymentMilestone.Type.ADVANCE
            and milestone.status == PaymentMilestone.Status.PAID
        ),
    )

    if has_advance_payment_paid is None:
        has_advance_payment_paid = project.payment_milestones.filter(
            type=PaymentMilestone.Type.ADVANCE,
            status=PaymentMilestone.Status.PAID,
        ).exists()

    if has_advance_payment_paid:
        return "advance_paid"

    has_advance_payment_ready = related_exists(
        project,
        "payment_milestones",
        lambda milestone: (
            milestone.type == PaymentMilestone.Type.ADVANCE
            and milestone.status in [
                PaymentMilestone.Status.READY,
                PaymentMilestone.Status.REQUESTED,
            ]
        ),
    )

    if has_advance_payment_ready is None:
        has_advance_payment_ready = project.payment_milestones.filter(
            type=PaymentMilestone.Type.ADVANCE,
            status__in=[
                PaymentMilestone.Status.READY,
                PaymentMilestone.Status.REQUESTED,
            ],
        ).exists()

    if has_advance_payment_ready:
        return "advance_payment"

    if (
        has_related_object(project, "client_profile")
        or has_complete_discovery(project)
    ):
        return "discovery"

    return "created"
