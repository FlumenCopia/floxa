# Generated manually to safely add a unique UUIDField with existing rows.

import uuid

from django.db import migrations, models


def populate_portal_tokens(apps, schema_editor):
    Project = apps.get_model("projects", "Project")

    for project in Project.objects.filter(portal_token__isnull=True):
        project.portal_token = uuid.uuid4()
        project.save(update_fields=["portal_token"])


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="portal_token",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(populate_portal_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="project",
            name="portal_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
