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
    
