from django.conf import settings
from django.db import models
from decimal import Decimal, ROUND_HALF_UP
import uuid


class Client(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField()
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.company_name


class Project(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        DISCOVERY = "discovery", "Discovery"
        ADVANCE_PAID = "advance_paid", "Advance Paid"
        CONCEPTS = "concepts", "Concepts"
        DELIVERED = "delivered", "Delivered"
        ARCHIVED = "archived", "Archived"

    consultant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="projects",
    )

    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="projects",
    )

    title = models.CharField(max_length=255)
    company_name = models.CharField(max_length=255)
    sector = models.CharField(max_length=100)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CREATED,
    )

    project_value = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    advance_percentage = models.PositiveSmallIntegerField(default=50)
    mid_percentage = models.PositiveSmallIntegerField(default=25)
    final_percentage = models.PositiveSmallIntegerField(default=25)
    revision_limit = models.CharField(max_length=50, default="3 revisions", blank=True)

    portal_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    portal_password_hash = models.CharField(max_length=128, blank=True)

    progress = models.PositiveIntegerField(default=0)
    client_signed_off = models.BooleanField(default=False)
    signed_off_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class ClientProfile(models.Model):
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="client_profile",
    )
    client_name = models.CharField(max_length=255, blank=True)
    company_name = models.CharField(max_length=255, blank=True)
    industry = models.CharField(max_length=255, blank=True)
    year_started = models.PositiveIntegerField(null=True, blank=True)
    location = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.client_name or self.company_name or 'Client profile'} - {self.project}"


class ProjectDiscovery(models.Model):
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="discovery",
    )
    what_business_does = models.TextField(blank=True)
    target_customer = models.TextField(blank=True)
    why_choose_us = models.TextField(blank=True)
    brand_feeling = models.TextField(blank=True)
    audience_archetype = models.CharField(max_length=255, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Discovery - {self.project}"


class DiscoverySliderResponse(models.Model):
    discovery = models.ForeignKey(
        ProjectDiscovery,
        on_delete=models.CASCADE,
        related_name="sliders",
    )
    slider_key = models.CharField(max_length=100)
    left_label = models.CharField(max_length=100, blank=True)
    right_label = models.CharField(max_length=100, blank=True)
    value = models.PositiveIntegerField(default=50)

    def __str__(self):
        return f"{self.slider_key}: {self.value}"


class DiscoveryEmotion(models.Model):
    discovery = models.ForeignKey(
        ProjectDiscovery,
        on_delete=models.CASCADE,
        related_name="emotions",
    )
    emotion = models.CharField(max_length=100)

    def __str__(self):
        return self.emotion


class DiscoveryCompetitor(models.Model):
    class Rating(models.TextChoices):
        LIKE = "like", "Like"
        DISLIKE = "dislike", "Dislike"
        NEUTRAL = "neutral", "Neutral"

    discovery = models.ForeignKey(
        ProjectDiscovery,
        on_delete=models.CASCADE,
        related_name="competitors",
    )
    name = models.CharField(max_length=255)
    rating = models.CharField(
        max_length=20,
        choices=Rating.choices,
        default=Rating.NEUTRAL,
    )
    reason = models.TextField(blank=True)

    def __str__(self):
        return f"{self.name} ({self.rating})"


class DiscoveryVisualStyle(models.Model):
    discovery = models.ForeignKey(
        ProjectDiscovery,
        on_delete=models.CASCADE,
        related_name="visual_styles",
    )
    style = models.CharField(max_length=100)

    def __str__(self):
        return self.style


class BrandDNA(models.Model):
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="brand_dna",
    )
    brand_personality_cluster = models.CharField(max_length=255, blank=True)
    business_summary = models.TextField(blank=True)
    target_audience_summary = models.TextField(blank=True)
    positioning_summary = models.TextField(blank=True)
    brand_feeling_summary = models.TextField(blank=True)
    visual_direction_summary = models.TextField(blank=True)
    competitor_summary = models.TextField(blank=True)
    generated_from_discovery = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Brand DNA - {self.project}"


class Moodboard(models.Model):
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="moodboards",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="moodboards/")
    is_selected = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.project}"


class Concept(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SHARED = "shared", "Shared"
        APPROVED = "approved", "Approved"
        CHANGES_REQUESTED = "changes_requested", "Changes Requested"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="concepts",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="concepts/", blank=True, null=True)
    file = models.FileField(upload_to="concepts/files/", blank=True, null=True)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    client_feedback = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} v{self.version} - {self.project}"


class Deliverable(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SHARED = "shared", "Shared"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="deliverables",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to="deliverables/")
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.project}"


class Agreement(models.Model):
    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="agreement",
    )
    title = models.CharField(max_length=255, default="Agreement")
    file = models.FileField(upload_to="agreements/")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.project}"


class GeneratedAgreementSnapshot(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACCEPTED = "accepted", "Accepted"
        LOCKED = "locked", "Locked"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="generated_agreement_snapshots",
    )
    version = models.PositiveIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    snapshot = models.JSONField(default=dict)
    pdf_file = models.FileField(upload_to="generated_agreements/", blank=True)
    generated_at = models.DateTimeField()
    pdf_generated_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "version"],
                name="unique_generated_agreement_version_per_project",
            )
        ]
        ordering = ["-version"]

    def __str__(self):
        return f"Generated agreement v{self.version} - {self.project}"


class ProjectAgreement(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SHARED = "shared", "Shared"
        SIGNATURE_REQUESTED = "signature_requested", "Signature Requested"
        SIGNED = "signed", "Signed"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    class SignatureMethod(models.TextChoices):
        TYPED = "typed", "Typed"
        DRAWN = "drawn", "Drawn"
        UPLOADED = "uploaded", "Uploaded"

    project = models.OneToOneField(
        Project,
        on_delete=models.CASCADE,
        related_name="project_agreement",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    basic_pdf_file = models.FileField(upload_to="project_agreements/basic/", blank=True)
    original_signed_pdf_file = models.FileField(upload_to="project_agreements/original_signed/", blank=True)
    signed_pdf_file = models.FileField(upload_to="project_agreements/signed/", blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    shared_at = models.DateTimeField(null=True, blank=True)
    signature_requested_at = models.DateTimeField(null=True, blank=True)
    signature_request_email_failed_at = models.DateTimeField(null=True, blank=True)
    signature_request_email_error = models.TextField(blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    signed_email_failed_at = models.DateTimeField(null=True, blank=True)
    signed_email_error = models.TextField(blank=True)
    signer_name = models.CharField(max_length=255, blank=True)
    signature_method = models.CharField(
        max_length=20,
        choices=SignatureMethod.choices,
        blank=True,
    )
    signature_image = models.ImageField(upload_to="project_agreements/signatures/", null=True, blank=True)
    signature_metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Project agreement - {self.project}"


class ProjectAgreementAppendix(models.Model):
    agreement = models.ForeignKey(
        ProjectAgreement,
        on_delete=models.CASCADE,
        related_name="appendices",
    )
    event_type = models.CharField(max_length=100)
    event_key = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=255)
    content = models.JSONField(default=dict, blank=True)
    source_activity = models.ForeignKey(
        "ProjectActivity",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="agreement_appendices",
    )
    pdf_page_number = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["agreement", "source_activity"],
                condition=models.Q(source_activity__isnull=False),
                name="unique_appendix_source_activity_per_agreement",
            ),
            models.UniqueConstraint(
                fields=["agreement", "event_type", "event_key"],
                condition=~models.Q(event_key=""),
                name="unique_appendix_event_key_per_agreement",
            ),
        ]
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.title} - {self.agreement}"


class PaymentMilestone(models.Model):
    class Type(models.TextChoices):
        ADVANCE = "advance", "Advance"
        MID = "mid", "Mid"
        FINAL = "final", "Final"

    class Status(models.TextChoices):
        LOCKED = "locked", "Locked"
        READY = "ready", "Ready"
        REQUESTED = "requested", "Requested"
        PAID = "paid", "Paid"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="payment_milestones",
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    percentage = models.PositiveSmallIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.LOCKED,
    )
    requested_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["project", "type"],
                name="unique_payment_milestone_type_per_project",
            )
        ]

    def calculate_amount(self):
        amount = Decimal(self.project.project_value or 0) * Decimal(self.percentage) / Decimal(100)
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def save(self, *args, **kwargs):
        self.amount = self.calculate_amount()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_type_display()} payment - {self.project}"


class ProjectActivity(models.Model):
    class ActorType(models.TextChoices):
        CLIENT = "client", "Client"
        CONSULTANT = "consultant", "Consultant"
        SYSTEM = "system", "System"

    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    consultant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="project_activities",
    )
    actor_type = models.CharField(
        max_length=20,
        choices=ActorType.choices,
    )
    action = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    visible_to_client = models.BooleanField(default=False)
    client_is_read = models.BooleanField(default=False)
    client_read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} - {self.project}"
