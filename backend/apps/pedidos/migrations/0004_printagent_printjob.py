import secrets
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pedidos', '0003_alter_pedido_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='PrintAgent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hostname', models.CharField(max_length=100)),
                ('token', models.CharField(default=secrets.token_hex, max_length=64, unique=True)),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('ultimo_heartbeat', models.DateTimeField(blank=True, null=True)),
                ('versao', models.CharField(blank=True, max_length=20)),
            ],
        ),
        migrations.CreateModel(
            name='PrintJob',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('conteudo', models.BinaryField()),
                ('status', models.CharField(
                    choices=[('pendente', 'Pendente'), ('retirado', 'Retirado'), ('erro', 'Erro')],
                    default='pendente',
                    max_length=20,
                )),
                ('criado_em', models.DateTimeField(auto_now_add=True)),
                ('retirado_em', models.DateTimeField(blank=True, null=True)),
                ('erro', models.TextField(blank=True)),
                ('impressora', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='jobs',
                    to='pedidos.impressora',
                )),
            ],
            options={
                'ordering': ['criado_em'],
            },
        ),
    ]
