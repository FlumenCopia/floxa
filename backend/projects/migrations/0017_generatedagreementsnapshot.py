from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0016_project_portal_password_hash"),
    ]

    operations = [
        migrations.CreateModel(
            name="GeneratedAgreementSnapshot",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("version", models.PositiveIntegerField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("accepted", "Accepted"),
                            ("locked", "Locked"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("snapshot", models.JSONField(default=dict)),
                ("generated_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="generated_agreement_snapshots",
                        to="projects.project",
                    ),
                ),
            ],
            options={
                "ordering": ["-version"],
            },
        ),
        migrations.AddConstraint(
            model_name="generatedagreementsnapshot",
            constraint=models.UniqueConstraint(
                fields=("project", "version"),
                name="unique_generated_agreement_version_per_project",
            ),
        ),
    ]
