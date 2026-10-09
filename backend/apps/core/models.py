from django.contrib.auth.models import AbstractUser
from django.db import models


class Configuracao(models.Model):
    """Configurações operacionais do sistema (DESIGN.md — "Configurações do sistema").

    Editável pelo admin no Django admin. `obter()` devolve o default quando a
    chave ainda não foi cadastrada.
    """

    class Chave(models.TextChoices):
        LIBERACAO_PROXIMA_SEQUENCIA = 'liberacao_proxima_sequencia', 'Liberação da próxima sequência'
        FECHAMENTO_SOBRA = 'fechamento_sobra', 'Fechamento de pedido com sobra'
        JANELA_SYNC_DIAS = 'janela_sync_dias', 'Janela do sync Senior (dias)'
        IMPRESSORA_PADRAO = 'impressora_padrao', 'Impressora padrão das etiquetas de volume'
        ETIQUETA_AUTOMATICA = 'etiqueta_automatica', 'Imprimir etiqueta de volume ao concluir'

    # valores válidos por chave (documentação viva; o admin não valida à força)
    DEFAULTS = {
        'liberacao_proxima_sequencia': 'ao_terminar_meus_pedidos',  # | ao_concluir_sequencia_inteira
        'fechamento_sobra': 'supervisor_patio',                     # | conferente
        # Só importa pedidos/NFs com datemi dentro dos últimos N dias.
        # 5 = valor definido para produção (2026-09-09); ajustável no admin sem redeploy.
        'janela_sync_dias': '5',
        # Etiqueta de volume (2026-10-07): id da Impressora que recebe a impressão
        # automática ao virar Conferido ('' = ninguém; fica em "Etiquetas pendentes").
        'impressora_padrao': '',
        'etiqueta_automatica': 'sim',                              # | nao
    }

    chave = models.CharField(max_length=50, choices=Chave.choices, unique=True)
    valor = models.CharField(max_length=50)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuração'
        verbose_name_plural = 'Configurações'

    def __str__(self):
        return f'{self.get_chave_display()}: {self.valor}'

    @classmethod
    def obter(cls, chave: str) -> str:
        try:
            return cls.objects.get(chave=chave).valor
        except cls.DoesNotExist:
            return cls.DEFAULTS.get(chave, '')


class ExecucaoTarefa(models.Model):
    """Heartbeat das tarefas Celery (observabilidade, 2026-10-08).

    Uma linha por execução, gravada pelo decorator `apps.core.tarefas.registrar_execucao`:
    começa como `rodando` e termina `ok` ou `erro`. É o que responde "o sync
    rodou? quando? demorou quanto? deu erro?" sem abrir `docker logs`. O
    `/api/saude/` lê daqui a última execução de cada tarefa e marca `atrasada`
    quando passou de 3× o intervalo do beat. Retenção: 7 dias (limpeza no
    próprio decorator).
    """

    class Status(models.TextChoices):
        RODANDO = 'rodando', 'Rodando'
        OK = 'ok', 'OK'
        ERRO = 'erro', 'Erro'

    tarefa = models.CharField(max_length=120, db_index=True)       # nome Celery (módulo.função)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RODANDO)
    iniciada_em = models.DateTimeField(db_index=True)
    terminada_em = models.DateTimeField(null=True, blank=True)
    duracao_ms = models.IntegerField(null=True, blank=True)
    worker = models.CharField(max_length=100, blank=True)
    resultado = models.JSONField(null=True, blank=True)             # retorno da task (dict)
    erro = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Execução de tarefa'
        verbose_name_plural = 'Execuções de tarefas'
        ordering = ['-iniciada_em']
        indexes = [models.Index(fields=['tarefa', '-iniciada_em'])]

    def __str__(self):
        return f'{self.tarefa.rsplit(".", 1)[-1]} {self.status} {self.iniciada_em:%d/%m %H:%M:%S}'


class ErroCliente(models.Model):
    """Erro que aconteceu no web ou no coletor (observabilidade, 2026-10-08).

    O frontend (error.tsx + window.onerror) e o mobile (ErrorBoundary +
    ErrorUtils) mandam `POST /api/erros-cliente/` quando algo quebra na mão
    do usuário. Antes disso, um app travado no coletor só era descoberto se
    o conferente contasse. Entra em Admin → Saúde (24 h) e no Django admin.
    Retenção: 30 dias (limpeza no próprio endpoint).
    """

    class Origem(models.TextChoices):
        WEB = 'web', 'Web'
        MOBILE = 'mobile', 'Mobile'

    origem = models.CharField(max_length=10, choices=Origem.choices)
    tela = models.CharField(max_length=200, blank=True)        # rota / pathname
    mensagem = models.CharField(max_length=500)
    stack = models.TextField(blank=True)
    versao = models.CharField(max_length=40, blank=True)       # APK 0.7.0 / build do web
    dispositivo = models.CharField(max_length=200, blank=True) # modelo / user agent resumido
    usuario = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)
    extra = models.JSONField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'Erro de cliente'
        verbose_name_plural = 'Erros de cliente'
        ordering = ['-criado_em']

    def __str__(self):
        return f'[{self.origem}] {self.mensagem[:60]}'


class User(AbstractUser):
    class Perfil(models.TextChoices):
        CONFERENTE = 'conferente', 'Conferente'
        SUPERVISOR_VENDAS = 'supervisor_vendas', 'Supervisor de Vendas'
        SUPERVISOR_PATIO = 'supervisor_patio', 'Supervisor de Pátio'
        ADMIN = 'admin', 'Admin'
        ETIQUETADOR = 'etiquetador', 'Etiquetador'  # CONGELADO — escopo antigo

    perfil = models.CharField(max_length=20, choices=Perfil.choices, default=Perfil.CONFERENTE)

    def __str__(self):
        return f'{self.username} ({self.get_perfil_display()})'
