from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0022_projectdiscovery_submitted_at"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="project",
            name="portal_token_expires_at",
        ),
        migrations.RemoveField(
            model_name="project",
            name="portal_token_revoked_at",
        ),
    ]
