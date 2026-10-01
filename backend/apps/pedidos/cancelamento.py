"""Cancelamento de documentos e transferência de conferência (2026-09-30).

Um pedido/NF pode ser cancelado no Senior (sitPed=5 / sitNfv=9) enquanto está em
conferência — ou até depois de conferido, com as caixas já fechadas. O documento
reemitido entra pelo sync como um Pedido novo, sem relação com o cancelado. Este
módulo concentra:

  - cancelar(): marca o documento como Cancelado preservando volumes e progresso;
  - comparar_itens(): diff item a item entre origem e destino;
  - transferir(): move a conferência (volumes, qtd_separada, conferente, status)
    para o documento novo — só quando os itens batem 100%.
"""
from django.db import transaction
from django.utils import timezone

from .models import Pedido, PedidoItem, PedidoLog, Sequencia, Volume, VolumeItem

# Status em que o documento ainda importa para o galpão. Conferido entra porque as
# caixas existem fisicamente — se a nota for cancelada depois, a transferência evita
# desmontar tudo. Cancelado e os status do escopo antigo ficam de fora.
STATUS_MONITORADOS = (
    Pedido.Status.PENDENTE,
    Pedido.Status.SELECIONADO,
    Pedido.Status.ATRIBUIDO,
    Pedido.Status.CONFERINDO,
    Pedido.Status.AGUARDANDO_FECHAMENTO,
    Pedido.Status.NAO_CONFORME,
    Pedido.Status.CONFERIDO,
)

# Destino da transferência: documento que ainda não entrou na mão de ninguém.
STATUS_DESTINO_TRANSFERENCIA = (Pedido.Status.PENDENTE, Pedido.Status.SELECIONADO)


def cancelar(pedido: Pedido, origem: str, usuario=None, payload: dict | None = None) -> Pedido:
    """Transição para Cancelado. Não apaga nada: volumes, itens e apontamentos ficam."""
    status_anterior = pedido.status
    pedido.status = Pedido.Status.CANCELADO
    pedido.status_anterior = status_anterior
    pedido.cancelado_em = timezone.now()
    pedido.cancelado_origem = origem
    pedido.save(update_fields=['status', 'status_anterior', 'cancelado_em', 'cancelado_origem'])
    PedidoLog.objects.create(
        pedido=pedido, usuario=usuario,
        acao='cancelado',
        payload={'origem': origem, 'status_anterior': status_anterior, **(payload or {})},
    )
    if pedido.sequencia_id:
        pedido.sequencia.recalcular_status()
    return pedido


def _chave(item: PedidoItem) -> str:
    # codpro/codder identificam o produto no Senior; sku é derivado deles (+codemp).
    return item.sku


def comparar_itens(origem: Pedido, destino: Pedido) -> dict:
    """Diff item a item. `igual` só é True quando SKUs e quantidades batem 100%."""
    de = {_chave(i): i for i in origem.itens.all()}
    para = {_chave(i): i for i in destino.itens.all()}
    linhas = []
    igual = True
    for sku in sorted(set(de) | set(para)):
        a, b = de.get(sku), para.get(sku)
        qtd_a = a.qtd_pedida if a else 0
        qtd_b = b.qtd_pedida if b else 0
        if a is None:
            situacao = 'so_no_destino'
        elif b is None:
            situacao = 'so_na_origem'
        elif qtd_a != qtd_b:
            situacao = 'qtd_diferente'
        else:
            situacao = 'igual'
        if situacao != 'igual':
            igual = False
        linhas.append({
            'sku': sku,
            'descricao': (a or b).descricao,
            'qtd_origem': qtd_a,
            'qtd_destino': qtd_b,
            'qtd_separada_origem': a.qtd_separada if a else 0,
            'situacao': situacao,
        })
    return {'igual': igual, 'itens': linhas}


class TransferenciaInvalida(Exception):
    def __init__(self, erro: str, comparacao: dict | None = None):
        super().__init__(erro)
        self.erro = erro
        self.comparacao = comparacao


def validar_transferencia(origem: Pedido, destino: Pedido) -> dict:
    if origem.status != Pedido.Status.CANCELADO:
        raise TransferenciaInvalida(f'documento de origem está em "{origem.status}", não em Cancelado')
    if origem.transferido_para_id:
        raise TransferenciaInvalida('conferência deste documento já foi transferida')
    if origem.pk == destino.pk:
        raise TransferenciaInvalida('origem e destino são o mesmo documento')
    if destino.status not in STATUS_DESTINO_TRANSFERENCIA:
        raise TransferenciaInvalida(
            f'documento de destino está em "{destino.status}" — só Pendente ou Selecionado'
        )
    if not origem.status_anterior or origem.status_anterior in (
        Pedido.Status.PENDENTE, Pedido.Status.SELECIONADO,
    ):
        raise TransferenciaInvalida(
            'documento cancelado antes de ser atribuído — não há conferência para transferir'
        )
    comparacao = comparar_itens(origem, destino)
    if not comparacao['igual']:
        raise TransferenciaInvalida('itens não batem entre origem e destino', comparacao)
    return comparacao


@transaction.atomic
def transferir(origem: Pedido, destino: Pedido, usuario) -> Pedido:
    """Move a conferência do documento cancelado para o reemitido.

    O destino assume o status que a origem tinha ao ser cancelada, a mesma sequência,
    o mesmo conferente/separador e os mesmos volumes (VolumeItem re-apontado para o
    PedidoItem equivalente por SKU). A origem continua Cancelada, agora com
    `transferido_para` preenchido; os VolumeItem saem dela junto com os volumes.
    """
    origem = Pedido.objects.select_for_update().get(pk=origem.pk)
    destino = Pedido.objects.select_for_update().get(pk=destino.pk)
    comparacao = validar_transferencia(origem, destino)

    itens_destino = {i.sku: i for i in destino.itens.all()}
    for item_origem in origem.itens.all():
        item_destino = itens_destino[item_origem.sku]
        item_destino.qtd_separada = item_origem.qtd_separada
        item_destino.status = item_origem.status
        item_destino.save(update_fields=['qtd_separada', 'status'])
        VolumeItem.objects.filter(pedido_item=item_origem).update(pedido_item=item_destino)
    Volume.objects.filter(pedido=origem).update(pedido=destino)

    destino.status = origem.status_anterior
    destino.sequencia = origem.sequencia
    destino.conferente = origem.conferente
    destino.selecionado_em = origem.selecionado_em
    destino.selecionado_por = origem.selecionado_por
    destino.atribuido_em = origem.atribuido_em
    destino.atribuido_por = origem.atribuido_por
    destino.conferencia_iniciada_em = origem.conferencia_iniciada_em
    destino.conferido_em = origem.conferido_em
    destino.separado_por = origem.separado_por
    destino.separador_nao_identificado = origem.separador_nao_identificado
    destino.nao_conforme_em = origem.nao_conforme_em
    destino.nao_conforme_motivo = origem.nao_conforme_motivo
    destino.nao_conforme_detalhe = origem.nao_conforme_detalhe
    # O WS Senior (quando existir) precisa ser chamado de novo para o documento novo.
    destino.senior_atualizado_em = None
    destino.senior_tentativas = 0
    destino.senior_ultimo_erro = ''
    destino.save()

    origem.transferido_para = destino
    origem.save(update_fields=['transferido_para'])

    payload = {
        'origem_id': origem.id, 'origem_numero': origem.numero_externo, 'origem_tipo': origem.tipo,
        'destino_id': destino.id, 'destino_numero': destino.numero_externo, 'destino_tipo': destino.tipo,
        'status': destino.status, 'volumes': Volume.objects.filter(pedido=destino).count(),
        'itens': len(comparacao['itens']),
    }
    PedidoLog.objects.create(pedido=origem, usuario=usuario, acao='conferencia_transferida', payload=payload)
    PedidoLog.objects.create(pedido=destino, usuario=usuario, acao='conferencia_recebida', payload=payload)

    # A sequência pode ter fechado quando a origem foi cancelada (Cancelado conta como
    # final). Se o destino volta com pendência, a sequência reabre em andamento.
    seq = destino.sequencia
    if seq:
        if destino.status in (Pedido.Status.ATRIBUIDO, Pedido.Status.CONFERINDO):
            if seq.status == Sequencia.Status.CONCLUIDA:
                seq.status = Sequencia.Status.EM_ANDAMENTO
                seq.concluida_em = None
                seq.save(update_fields=['status', 'concluida_em'])
        else:
            seq.recalcular_status()
    return destino
