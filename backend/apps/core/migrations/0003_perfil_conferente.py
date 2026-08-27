# Rename do redesenho 2026-08 (ver DESIGN.md): perfil 'separador' → 'conferente'.
from django.db import migrations, models


def separador_para_conferente(apps, schema_editor):
    User = apps.get_model('core', 'User')
    User.objects.filter(perfil='separador').update(perfil='conferente')


def conferente_para_separador(apps, schema_editor):
    User = apps.get_model('core', 'User')
    User.objects.filter(perfil='conferente').update(perfil='separador')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_alter_user_perfil'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='perfil',
            field=models.CharField(
                choices=[
                    ('conferente', 'Conferente'),
                    ('supervisor_vendas', 'Supervisor de Vendas'),
                    ('supervisor_patio', 'Supervisor de Pátio'),
                    ('admin', 'Admin'),
                    ('etiquetador', 'Etiquetador'),
                ],
                default='conferente',
                max_length=20,
            ),
        ),
        migrations.RunPython(separador_para_conferente, conferente_para_separador),
    ]
