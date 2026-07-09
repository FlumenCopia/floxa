from django.conf import settings
from django.db import models
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

    progress = models.PositiveIntegerField(default=0)
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
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} - {self.project}"
