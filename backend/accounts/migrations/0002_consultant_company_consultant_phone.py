# Generated for adding optional consultant profile fields.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="consultant",
            name="company",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="consultant",
            name="phone",
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
