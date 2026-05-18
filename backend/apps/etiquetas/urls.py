from django.urls import path
from . import views

urlpatterns = [
    # Impressoras — listagem (todos os perfis)
    path('etiquetas/impressoras/', views.listar_impressoras, name='listar_impressoras'),

    # Impressoras — CRUD (admin)
    path('etiquetas/admin/impressoras/', views.impressoras, name='impressoras'),
    path('etiquetas/admin/impressoras/<int:pk>/', views.impressora_detalhe, name='impressora_detalhe'),
    path('etiquetas/admin/impressoras/<int:pk>/testar/', views.testar_impressora, name='testar_impressora'),

    # PrintAgent — chamados pelo agent local (auth por token próprio)
    path('etiquetas/agents/registrar/', views.registrar_agent, name='registrar_agent'),
    path('etiquetas/agents/heartbeat/', views.heartbeat_agent, name='heartbeat_agent'),
    path('etiquetas/agents/jobs/', views.jobs_pendentes, name='jobs_pendentes'),
    path('etiquetas/agents/jobs/<int:job_id>/ack/', views.ack_job, name='ack_job'),

    # PrintAgent — listagem (admin)
    path('etiquetas/admin/agents/', views.listar_agents, name='listar_agents'),

    # Lotes
    path('etiquetas/lotes/criar/', views.criar_lote, name='criar_lote'),
    path('etiquetas/lotes/ativo/', views.lote_ativo, name='lote_ativo'),
    path('etiquetas/lotes/<int:pk>/', views.detalhe_lote, name='detalhe_lote'),
    path('etiquetas/lotes/<int:pk>/confirmar/', views.confirmar_pedido_lote, name='confirmar_pedido_lote'),
    path('etiquetas/lotes/<int:pk>/finalizar/', views.finalizar_lote, name='finalizar_lote'),
    path('etiquetas/imprimir/', views.imprimir_lote, name='imprimir_lote'),
]
