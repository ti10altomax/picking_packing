import secrets

from django.db import models
from django.conf import settings
from django.utils import timezone


class Marketplace(models.Model):
    slug = models.SlugField(unique=True)
    nome = models.CharField(max_length=100)
    ativo = models.BooleanField(default=True)

    def __str__(self):
        return self.nome


class Pedido(models.Model):
    class Status(models.TextChoices):
        # Escopo atual (conferência interna)
        PENDENTE = 'pendente', 'Pendente'
        SELECIONADO = 'selecionado', 'Selecionado'
        ATRIBUIDO = 'atribuido', 'Atribuído'
        CONFERINDO = 'conferindo', 'Em conferência'
        CONFERIDO = 'conferido', 'Conferido'
        NAO_CONFORME = 'nao_conforme', 'Não conforme'
        CANCELADO = 'cancelado', 'Cancelado'
        # Escopo antigo (CONGELADO — fluxo de etiquetagem marketplace/VTEX)
        FATURADO = 'faturado', 'Faturado'
        AGUARDANDO_ETIQUETAR = 'aguardando_etiquetar', 'Aguardando etiquetar'
        CONCLUIDO = 'concluido', 'Concluído'

    class MotivoNaoConforme(models.TextChoices):
        DIVERGENCIA_QTD = 'divergencia_qtd', 'Divergência de quantidade'
        PRODUTO_ERRADO = 'produto_errado', 'Produto errado'
        ITEM_AUSENTE = 'item_ausente', 'Item ausente'

    numero_externo = models.CharField(max_length=100, unique=True)
    marketplace = models.ForeignKey(Marketplace, on_delete=models.PROTECT, null=True, blank=True)
    cliente = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDENTE)

    criado_em = models.DateTimeField()
    conferido_em = models.DateTimeField(null=True, blank=True)
    faturado_em = models.DateTimeField(null=True, blank=True)

    endereco_fisico = models.CharField(max_length=20, blank=True)
    ordem_pilha = models.IntegerField(null=True, blank=True)

    conferente = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos_conferidos'
    )
    etiquetador = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos_etiquetados'
    )

    # Fluxo de seleção / atribuição (escopo atual)
    selecionado_em = models.DateTimeField(null=True, blank=True)
    selecionado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos_selecionados',
    )
    atribuido_em = models.DateTimeField(null=True, blank=True)
    atribuido_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos_atribuidos',
    )

    # Sequência de separação (Fase 3 — DESIGN.md §3). Nula até o Sup. Pátio montar.
    sequencia = models.ForeignKey(
        'Sequencia', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos',
    )
    conferencia_iniciada_em = models.DateTimeField(null=True, blank=True)

    # Apontamento de quem separou fisicamente (registrado pelo conferente ao iniciar)
    separado_por = models.ForeignKey(
        'Separador', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='pedidos_separados',
    )
    separador_nao_identificado = models.BooleanField(default=False)

    # Não conforme
    nao_conforme_em = models.DateTimeField(null=True, blank=True)
    nao_conforme_motivo = models.CharField(
        max_length=30, choices=MotivoNaoConforme.choices, blank=True
    )
    nao_conforme_detalhe = models.TextField(blank=True)

    # Senior — atualização pós-conferência (WS a definir)
    senior_atualizado_em = models.DateTimeField(null=True, blank=True)
    senior_tentativas = models.IntegerField(default=0)
    senior_ultimo_erro = models.TextField(blank=True)

    # ----- Campos do escopo antigo (CONGELADO — não usar no fluxo atual) -----
    # Senior SOAP (embalagempfa)
    embalagem_enviada_em = models.DateTimeField(null=True, blank=True)
    embalagem_tentativas = models.IntegerField(default=0)
    embalagem_ultimo_erro = models.TextField(blank=True)

    # VTEX API (etiqueta de envio)
    etiqueta_vtex_recebida_em = models.DateTimeField(null=True, blank=True)
    etiqueta_vtex_tentativas = models.IntegerField(default=0)
    etiqueta_vtex_ultimo_erro = models.TextField(blank=True)

    # Etiquetagem física
    etiqueta_impressa_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['criado_em']

    def __str__(self):
        return f'Pedido {self.numero_externo} [{self.status}]'


class PedidoItem(models.Model):
    class Status(models.TextChoices):
        OK = 'ok', 'OK'
        CANCELADO = 'cancelado', 'Cancelado'
        FALTA = 'falta', 'Em falta'

    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='itens')
    sku = models.CharField(max_length=100)
    descricao = models.CharField(max_length=255)
    ean = models.CharField(max_length=20, blank=True)
    qtd_pedida = models.IntegerField()
    qtd_separada = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OK)

    # Chave composta do produto no Senior (codpro/codder/codemp)
    codpro = models.CharField(max_length=20, blank=True)
    codder = models.CharField(max_length=20, blank=True)
    codemp = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f'{self.sku} x{self.qtd_pedida}'


class Volume(models.Model):
    class Tipo(models.TextChoices):
        CAIXA = 'caixa', 'Caixa'
        FARDO = 'fardo', 'Fardo'
        OUTRO = 'outro', 'Outro'

    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='volumes')
    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    identificador = models.CharField(max_length=100, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='volumes_criados',
    )
    fechado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['criado_em']

    def __str__(self):
        return f'Volume {self.pk} ({self.tipo}) — pedido {self.pedido_id}'


class VolumeItem(models.Model):
    volume = models.ForeignKey(Volume, on_delete=models.CASCADE, related_name='itens')
    pedido_item = models.ForeignKey(PedidoItem, on_delete=models.CASCADE, related_name='alocacoes')
    qtd = models.IntegerField()
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['criado_em']


class Sequencia(models.Model):
    """Onda de separação montada pelo Sup. Pátio (DESIGN.md §3).

    O pátio agrupa pedidos selecionados em sequências e atribui pedido a
    pedido a conferentes dentro delas. Vários conferentes podem participar da
    mesma sequência — a participação é derivada dos pedidos, sem tabela M:N.
    """

    class Status(models.TextChoices):
        ABERTA = 'aberta', 'Aberta'
        EM_ANDAMENTO = 'em_andamento', 'Em andamento'
        CONCLUIDA = 'concluida', 'Concluída'

    numero = models.IntegerField(unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ABERTA)
    criado_em = models.DateTimeField(auto_now_add=True)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='sequencias_criadas',
    )
    concluida_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-criado_em']
        verbose_name = 'Sequência'
        verbose_name_plural = 'Sequências'

    def __str__(self):
        return f'Sequência {self.numero} [{self.status}]'

    def recalcular_status(self):
        """Concluída quando todos os pedidos estão em estado final (não conforme não trava)."""
        finais = (Pedido.Status.CONFERIDO, Pedido.Status.NAO_CONFORME, Pedido.Status.CANCELADO)
        status_pedidos = list(self.pedidos.values_list('status', flat=True))
        if status_pedidos and all(s in finais for s in status_pedidos):
            if self.status != self.Status.CONCLUIDA:
                self.status = self.Status.CONCLUIDA
                self.concluida_em = timezone.now()
                self.save(update_fields=['status', 'concluida_em'])


class Separador(models.Model):
    """Trabalhador físico que separa mercadoria no estoque (em geral extras).

    Não é usuário do sistema — sem login. Se um dia contratado/precisar logar,
    cria-se o User e vincula em `user` (histórico preservado). Ver DESIGN.md §2.
    """

    class Tipo(models.TextChoices):
        EXTRA = 'extra', 'Extra'
        FUNCIONARIO = 'funcionario', 'Funcionário'

    nome = models.CharField(max_length=255)
    apelido = models.CharField(max_length=100, blank=True)
    documento = models.CharField(max_length=30, blank=True)
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.EXTRA)
    ativo = models.BooleanField(default=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='separador_registro',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nome']
        verbose_name = 'Separador'
        verbose_name_plural = 'Separadores'

    def __str__(self):
        return self.apelido or self.nome


class SeparadorLiberacao(models.Model):
    """Escala diária: quem está atuando como separador na data (Sup. Pátio marca)."""

    separador = models.ForeignKey(Separador, on_delete=models.CASCADE, related_name='liberacoes')
    data = models.DateField()
    liberado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='liberacoes_concedidas',
    )
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-data']
        constraints = [
            models.UniqueConstraint(fields=['separador', 'data'], name='liberacao_unica_por_dia'),
        ]
        verbose_name = 'Liberação diária'
        verbose_name_plural = 'Liberações diárias'

    def __str__(self):
        return f'{self.separador} liberado em {self.data}'


class EtiquetaVtex(models.Model):
    pedido = models.OneToOneField(Pedido, on_delete=models.CASCADE, related_name='etiqueta_vtex')
    formato = models.CharField(max_length=10)
    conteudo = models.BinaryField()
    recebida_em = models.DateTimeField(auto_now_add=True)
    hash = models.CharField(max_length=64)


class Impressora(models.Model):
    class TipoConexao(models.TextChoices):
        REDE = 'rede', 'Rede (TCP/IP)'
        USB = 'usb', 'USB (via agent)'

    class FormatoPreferido(models.TextChoices):
        ZPL = 'zpl', 'ZPL'
        PDF = 'pdf', 'PDF'

    nome = models.CharField(max_length=100)
    modelo = models.CharField(max_length=100)
    tipo_conexao = models.CharField(max_length=10, choices=TipoConexao.choices)
    formato_preferido = models.CharField(max_length=5, choices=FormatoPreferido.choices, default=FormatoPreferido.ZPL)
    ip = models.GenericIPAddressField(null=True, blank=True)
    porta = models.IntegerField(default=9100)
    agent_id = models.CharField(max_length=100, blank=True)
    dpi = models.IntegerField(default=203)
    largura_mm = models.IntegerField(default=100)
    altura_mm = models.IntegerField(default=150)
    mesa = models.CharField(max_length=50, blank=True)
    ativa = models.BooleanField(default=True)
    ultimo_heartbeat = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.nome} ({self.modelo})'


class PrintAgent(models.Model):
    hostname = models.CharField(max_length=100)
    token = models.CharField(max_length=64, unique=True, default=secrets.token_hex)
    criado_em = models.DateTimeField(auto_now_add=True)
    ultimo_heartbeat = models.DateTimeField(null=True, blank=True)
    versao = models.CharField(max_length=20, blank=True)

    def __str__(self):
        return self.hostname


class PrintJob(models.Model):
    class Status(models.TextChoices):
        PENDENTE = 'pendente', 'Pendente'
        RETIRADO = 'retirado', 'Retirado'
        ERRO = 'erro', 'Erro'

    impressora = models.ForeignKey(Impressora, on_delete=models.CASCADE, related_name='jobs')
    conteudo = models.BinaryField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDENTE)
    criado_em = models.DateTimeField(auto_now_add=True)
    retirado_em = models.DateTimeField(null=True, blank=True)
    erro = models.TextField(blank=True)

    class Meta:
        ordering = ['criado_em']


class Lote(models.Model):
    etiquetador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='lotes'
    )
    impressora = models.ForeignKey(Impressora, on_delete=models.PROTECT)
    criado_em = models.DateTimeField(auto_now_add=True)
    finalizado_em = models.DateTimeField(null=True, blank=True)
    mesa = models.CharField(max_length=50, blank=True)
    qtd_pedidos = models.IntegerField(default=0)

    def __str__(self):
        return f'Lote {self.pk} ({self.qtd_pedidos} pedidos)'


class LotePedido(models.Model):
    lote = models.ForeignKey(Lote, on_delete=models.CASCADE, related_name='itens')
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE)
    ordem = models.IntegerField()
    confirmado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['ordem']
        unique_together = [('lote', 'pedido')]


class PedidoLog(models.Model):
    pedido = models.ForeignKey(Pedido, on_delete=models.CASCADE, related_name='logs')
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    acao = models.CharField(max_length=100)
    payload = models.JSONField(default=dict)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['criado_em']
