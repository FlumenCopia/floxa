import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django
django.setup()

from django.contrib.auth import get_user_model
from django.db.models import Case, CharField, Exists, OuterRef, Q, Value, When

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
from projects.progress import calculate_project_workflow_status

User = get_user_model()


def get_workflow_status_annotation():
    """Build exact Django ORM annotation matching calculate_project_workflow_status."""
    has_final_paid = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.FINAL,
            status=PaymentMilestone.Status.PAID,
        )
    )

    has_shared_deliverable = Exists(
        Deliverable.objects.filter(
            project=OuterRef("pk"),
            status=Deliverable.Status.SHARED,
        )
    )

    has_agreement = Exists(
        ProjectAgreement.objects.filter(project=OuterRef("pk"))
    ) | Exists(
        Agreement.objects.filter(project=OuterRef("pk"))
    )

    has_shared_or_approved_concept = Exists(
        Concept.objects.filter(
            project=OuterRef("pk"),
            status__in=[Concept.Status.SHARED, Concept.Status.APPROVED],
        )
    )

    has_moodboard = Exists(
        Moodboard.objects.filter(project=OuterRef("pk"))
    )

    has_brand_dna = Exists(
        BrandDNA.objects.filter(project=OuterRef("pk"))
    )

    has_advance_paid = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.ADVANCE,
            status=PaymentMilestone.Status.PAID,
        )
    )

    has_advance_ready = Exists(
        PaymentMilestone.objects.filter(
            project=OuterRef("pk"),
            type=PaymentMilestone.Type.ADVANCE,
            status__in=[
                PaymentMilestone.Status.READY,
                PaymentMilestone.Status.REQUESTED,
            ],
        )
    )

    has_client_profile = Exists(
        ClientProfile.objects.filter(project=OuterRef("pk"))
    )

    has_emotions = Exists(
        DiscoveryEmotion.objects.filter(discovery__project=OuterRef("pk"))
    )
    has_competitors = Exists(
        DiscoveryCompetitor.objects.filter(discovery__project=OuterRef("pk"))
    )
    has_visual_styles = Exists(
        DiscoveryVisualStyle.objects.filter(discovery__project=OuterRef("pk"))
    )

    complete_discovery_q = (
        Q(discovery__isnull=False)
        & ~Q(discovery__what_business_does__isnull=True) & ~Q(discovery__what_business_does="")
        & ~Q(discovery__target_customer__isnull=True) & ~Q(discovery__target_customer="")
        & ~Q(discovery__why_choose_us__isnull=True) & ~Q(discovery__why_choose_us="")
        & ~Q(discovery__brand_feeling__isnull=True) & ~Q(discovery__brand_feeling="")
        & ~Q(discovery__audience_archetype__isnull=True) & ~Q(discovery__audience_archetype="")
        & Q(has_emotions_sub=True)
        & Q(has_competitors_sub=True)
        & Q(has_visual_styles_sub=True)
    )

    return Case(
        When(Q(client_signed_off=True) | Q(status=Project.Status.DELIVERED), then=Value("delivered")),
        When(has_final_paid, then=Value("final_paid")),
        When(has_shared_deliverable, then=Value("deliverables")),
        When(has_agreement, then=Value("agreement")),
        When(has_shared_or_approved_concept, then=Value("concepts")),
        When(has_moodboard, then=Value("moodboards")),
        When(has_brand_dna, then=Value("brand_dna")),
        When(has_advance_paid, then=Value("advance_paid")),
        When(has_advance_ready, then=Value("advance_payment")),
        When(has_client_profile | complete_discovery_q, then=Value("discovery")),
        default=Value("created"),
        output_field=CharField(),
    )


def test_equivalence():
    user, _ = User.objects.get_or_create(
        email="test_equiv@example.com",
        defaults={"name": "Equiv Test", "password": "password123"}
    )
    Project.objects.filter(consultant=user).delete()
    Client.objects.filter(email__startswith="equiv_client_").delete()

    clients = [
        Client(name=f"C {i}", email=f"equiv_client_{i}@example.com", company_name=f"Co {i}", sector="Tech")
        for i in range(11)
    ]
    Client.objects.bulk_create(clients)
    created_clients = list(Client.objects.filter(email__startswith="equiv_client_").order_by("id"))

    projects = [
        Project(
            title=f"Equiv Proj {i}",
            consultant=user,
            client=created_clients[i],
            company_name=f"Co {i}",
            sector="Tech",
        )
        for i in range(11)
    ]
    Project.objects.bulk_create(projects)
    created_projects = list(Project.objects.filter(consultant=user).order_by("id"))

    # Stage 0: created (nothing)
    # Stage 1: discovery (client_profile)
    ClientProfile.objects.create(project=created_projects[1], client_name="Name")
    # Stage 2: advance_payment (milestone advance ready)
    PaymentMilestone.objects.create(project=created_projects[2], type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.READY, percentage=50)
    # Stage 3: advance_paid (milestone advance paid)
    PaymentMilestone.objects.create(project=created_projects[3], type=PaymentMilestone.Type.ADVANCE, status=PaymentMilestone.Status.PAID, percentage=50)
    # Stage 4: brand_dna
    BrandDNA.objects.create(project=created_projects[4], brand_personality_cluster="Bold")
    # Stage 5: moodboard
    Moodboard.objects.create(project=created_projects[5], title="Board 1")
    # Stage 6: concept (shared)
    Concept.objects.create(project=created_projects[6], title="Concept 1", status=Concept.Status.SHARED)
    # Stage 7: agreement
    ProjectAgreement.objects.create(project=created_projects[7], status=ProjectAgreement.Status.DRAFT)
    # Stage 8: deliverables (shared)
    Deliverable.objects.create(project=created_projects[8], title="Logo", status=Deliverable.Status.SHARED)
    # Stage 9: final_paid (milestone final paid)
    PaymentMilestone.objects.create(project=created_projects[9], type=PaymentMilestone.Type.FINAL, status=PaymentMilestone.Status.PAID, percentage=25)
    # Stage 10: delivered
    created_projects[10].status = Project.Status.DELIVERED
    created_projects[10].save()

    # Query with annotation
    annotated_qs = Project.objects.filter(consultant=user).annotate(
        has_emotions_sub=Exists(DiscoveryEmotion.objects.filter(discovery__project=OuterRef("pk"))),
        has_competitors_sub=Exists(DiscoveryCompetitor.objects.filter(discovery__project=OuterRef("pk"))),
        has_visual_styles_sub=Exists(DiscoveryVisualStyle.objects.filter(discovery__project=OuterRef("pk"))),
        annotated_status=get_workflow_status_annotation(),
    ).order_by("id")

    # Prefetched for python comparison
    prefetched_qs = Project.objects.filter(consultant=user).select_related(
        "client_profile",
        "discovery",
        "brand_dna",
        "project_agreement",
        "agreement",
    ).prefetch_related(
        "discovery__emotions",
        "discovery__competitors",
        "discovery__visual_styles",
        "moodboards",
        "concepts",
        "deliverables",
        "payment_milestones",
    ).order_by("id")

    print(f"Total projects created: {len(created_projects)}")
    all_match = True
    for p_ann, p_pref in zip(annotated_qs, prefetched_qs):
        py_status = calculate_project_workflow_status(p_pref)
        sql_status = p_ann.annotated_status
        match = (py_status == sql_status)
        if not match:
            all_match = False
        print(f"Project ID {p_ann.id}: Python={py_status:<16} SQL={sql_status:<16} Match={match}")

    print(f"\nResult: {'ALL 100% MATCH' if all_match else 'MISMATCH FOUND'}")


if __name__ == "__main__":
    test_equivalence()
