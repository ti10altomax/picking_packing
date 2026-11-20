from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('impressao', '0003_versaoagente'),
    ]

    operations = [
        migrations.AddField(
            model_name='impressaoetiqueta',
            name='volumes',
            field=models.JSONField(blank=True, null=True),
        ),
    ]
