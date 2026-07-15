from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0018_generatedagreementsnapshot_pdf_file_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="generatedagreementsnapshot",
            name="accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
