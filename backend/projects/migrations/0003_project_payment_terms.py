from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0002_project_portal_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="advance_percentage",
            field=models.PositiveSmallIntegerField(default=50),
        ),
        migrations.AddField(
            model_name="project",
            name="mid_percentage",
            field=models.PositiveSmallIntegerField(default=25),
        ),
        migrations.AddField(
            model_name="project",
            name="final_percentage",
            field=models.PositiveSmallIntegerField(default=25),
        ),
        migrations.AddField(
            model_name="project",
            name="revision_limit",
            field=models.CharField(blank=True, default="3 revisions", max_length=50),
        ),
    ]
