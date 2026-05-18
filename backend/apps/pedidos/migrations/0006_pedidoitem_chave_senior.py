from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0005_pivot_separacao_interna'),
    ]

    operations = [
        migrations.AddField(
            model_name='pedidoitem',
            name='codpro',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='pedidoitem',
            name='codder',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='pedidoitem',
            name='codemp',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
