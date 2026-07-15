from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0021_remove_project_portal_token_expires_at_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="projectdiscovery",
            name="submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
