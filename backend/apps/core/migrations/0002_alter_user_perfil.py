from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='perfil',
            field=models.CharField(
                choices=[
                    ('separador', 'Separador'),
                    ('supervisor_vendas', 'Supervisor de Vendas'),
                    ('supervisor_patio', 'Supervisor de Pátio'),
                    ('admin', 'Admin'),
                    ('etiquetador', 'Etiquetador'),
                ],
                default='separador',
                max_length=20,
            ),
        ),
    ]
