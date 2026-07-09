# Generated manually for Phase 1 moodboards.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0005_branddna"),
    ]

    operations = [
        migrations.CreateModel(
            name="Moodboard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("image", models.ImageField(upload_to="moodboards/")),
                ("is_selected", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="moodboards",
                        to="projects.project",
                    ),
                ),
            ],
        ),
    ]
