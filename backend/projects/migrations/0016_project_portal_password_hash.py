from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0015_project_portal_token_expires_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="portal_password_hash",
            field=models.CharField(blank=True, max_length=128),
        ),
    ]
