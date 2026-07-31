from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0017_generatedagreementsnapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="generatedagreementsnapshot",
            name="pdf_file",
            field=models.FileField(blank=True, upload_to="generated_agreements/"),
        ),
        migrations.AddField(
            model_name="generatedagreementsnapshot",
            name="pdf_generated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
