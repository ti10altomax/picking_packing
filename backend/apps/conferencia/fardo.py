"""Volume fechado da fábrica lido pela OP (2026-11-05).

O volume chega lacrado com a etiqueta da OP do Sisplan (só dígitos, sem tamanho fixo — sempre
menos de 13, que é o tamanho do EAN). A TI publicou a view
`REPORTS.USU_OP_PRODUTOS` (OP, CODPRO, CODBAR, TAM, QTD) com o que vai dentro. Bipar a OP
na conferência compara o volume inteiro com o que ainda falta no documento:

- bateu  → cria um volume "OP N" já fechado, com os itens lançados;
- não bateu (produto fora do documento ou mais do que falta) → bloqueia tudo e não lança
  nada, porque volume lacrado não se divide;
- OP já lida em outro volume (fora de documento cancelado) → bloqueia.

Caixa ou fardo (2026-11-09): nem toda OP é fardo. O tipo sai do produto — posições 4-5 do
CODPRO em RP ou AL = fardo, o resto = caixa (regra da TI, `tipo_volume_da_op`). Basta o
primeiro item da OP: um volume nunca mistura os dois tipos.

Casamento: o CODBAR da OP com o código de barras do item (`PedidoItem.ean`, que já é o
efetivo: CODBAR → CODGTN → CODBAR do tamanho base — ver `senior.tasks.codigo_barras`); sem
código no item, produto + tamanho (G1/G2/G60 → G). Itens com o mesmo código (G1 e G2 no
mesmo pedido) são o mesmo produto físico: o fardo enche o primeiro e passa para o próximo.
"""
import logging
import re
from collections import OrderedDict

from django.db import models, transaction
from django.utils import timezone
from rest_framework import status as http_status

from apps.pedidos.models import Pedido, PedidoItem, PedidoLog, Volume, VolumeItem

logger = logging.getLogger(__name__)

# Sem tamanho fixo (a numeração vai crescer); sempre menor que os 13 dígitos do EAN.
RE_OP = re.compile(r'^\d{1,12}$')


class FardoErro(Exception):
    def __init__(self, resultado, mensagem, status=http_status.HTTP_409_CONFLICT, **dados):
        super().__init__(mensagem)
        self.resultado = resultado
        self.mensagem = mensagem
        self.status = status
        self.dados = dados


def _texto(v) -> str:
    if v is None:
        return ''
    if isinstance(v, (int, float)) or type(v).__name__ == 'Decimal':
        return str(int(v))
    return str(v).strip()


def _tamanho_base(codder: str) -> str:
    return re.sub(r'\d+$', '', codder or '')


# Famílias de produto que saem em fardo (posições 4-5 do CODPRO); o resto vai em caixa.
FAMILIAS_FARDO = ('RP', 'AL')


def tipo_volume_da_op(codpro) -> str:
    """Caixa ou fardo pelo CODPRO do (primeiro) item da OP — mesma regra do SQL da TI:
    `CASE WHEN substr(codpro, 4, 2) IN ('RP', 'AL') THEN 'FARDO' ELSE 'CAIXA' END`."""
    return Volume.Tipo.FARDO if _texto(codpro)[3:5].upper() in FAMILIAS_FARDO else Volume.Tipo.CAIXA


def buscar_op(op: str) -> list[dict]:
    """Linhas da OP na view, somadas por código de barras. Erro de Oracle sobe."""
    from apps.senior.oracle import QUERY_OP_PRODUTOS, fetch

    agrupado: OrderedDict[str, dict] = OrderedDict()
    for r in fetch(QUERY_OP_PRODUTOS, [op]):
        codbar = _texto(r.get('codbar'))
        codpro = _texto(r.get('codpro'))
        tam = _texto(r.get('tam'))
        try:
            qtd = int(r.get('qtd') or 0)
        except (TypeError, ValueError):
            qtd = 0
        if qtd <= 0:
            continue
        chave = codbar if codbar.strip('0') else f'{codpro}|{tam}'
        linha = agrupado.setdefault(chave, {'codbar': codbar, 'codpro': codpro, 'tam': tam, 'qtd': 0})
        linha['qtd'] += qtd
    return list(agrupado.values())


def _candidatos(itens, linha):
    codbar = linha['codbar']
    return [
        i for i in itens
        if (codbar and i.ean == codbar)
        or (i.codpro == linha['codpro'] and _tamanho_base(i.codder) == linha['tam'])
    ]


def _op_em_uso(op: str):
    return (
        Volume.objects.filter(op=op)
        .exclude(pedido__status=Pedido.Status.CANCELADO)
        .select_related('pedido')
        .first()
    )


def ler_fardo(pedido: Pedido, op, user):
    """Lança o fardo da OP no pedido (status Em conferência). Devolve (volume, lançados)."""
    op = _texto(op)
    if not RE_OP.match(op):
        raise FardoErro('op_invalida', 'código de OP inválido (só dígitos, menos de 13)', http_status.HTTP_400_BAD_REQUEST)

    usado = _op_em_uso(op)
    if usado:
        mesmo = usado.pedido_id == pedido.id
        raise FardoErro(
            'op_ja_lida',
            'esta OP já foi lida neste documento' if mesmo
            else f'esta OP já foi lida no documento {usado.pedido.numero_externo}',
            numero=usado.pedido.numero_externo, mesmo_documento=mesmo,
        )

    try:
        linhas = buscar_op(op)
    except Exception as e:
        logger.error('falha ao consultar a OP no Oracle', extra={'pedido': pedido.id, 'op': op, 'erro': str(e)})
        raise FardoErro('oracle_indisponivel', 'não foi possível consultar a OP agora — tente de novo',
                        http_status.HTTP_503_SERVICE_UNAVAILABLE)
    if not linhas:
        raise FardoErro('op_nao_encontrada', f'OP {op} não encontrada', http_status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        itens = list(
            pedido.itens.select_for_update()
            .filter(status=PedidoItem.Status.OK)
            .order_by('sku', 'id')
        )
        if _op_em_uso(op):  # leitura simultânea em outro coletor
            raise FardoErro('op_ja_lida', 'esta OP acabou de ser lida em outro coletor')

        plano, divergencias = [], []
        for linha in linhas:
            cands = _candidatos(itens, linha)
            restante = sum(max(i.qtd_pedida - i.qtd_separada, 0) for i in cands)
            if not cands:
                divergencias.append({**linha, 'restante': 0, 'motivo': 'fora_do_documento'})
                continue
            if linha['qtd'] > restante:
                divergencias.append({**linha, 'restante': restante, 'motivo': 'excede'})
                continue
            falta = linha['qtd']
            for i in cands:
                livre = i.qtd_pedida - i.qtd_separada
                if livre <= 0 or not falta:
                    continue
                q = min(livre, falta)
                plano.append((i, q))
                i.qtd_separada += q  # para o próximo cálculo dentro desta OP
                falta -= q

        if not divergencias:
            return _lancar(pedido, op, plano, user, tipo_volume_da_op(linhas[0]['codpro']))

    # fora da transação (que só travou os itens) para o rastro ficar gravado
    PedidoLog.objects.create(
        pedido=pedido, usuario=user, acao='fardo_op_divergente',
        payload={'op': op, 'divergencias': divergencias},
    )
    raise FardoErro('fardo_divergente', 'a OP não confere com o documento', divergencias=divergencias)


def _lancar(pedido, op, plano, user, tipo=Volume.Tipo.FARDO):
    """Dentro da transação de `ler_fardo`: volume fechado (caixa ou fardo, pelo produto) +
    lançamentos + rastro."""
    volume = Volume.objects.create(
        pedido=pedido, tipo=tipo, identificador=f'OP {op}', op=op,
        criado_por=user, fechado_em=timezone.now(),
    )
    lancados = []
    for item, q in plano:
        VolumeItem.objects.create(volume=volume, pedido_item=item, qtd=q)
        PedidoItem.objects.filter(pk=item.pk).update(qtd_separada=models.F('qtd_separada') + q)
        lancados.append({'item_id': item.id, 'sku': item.sku, 'qtd': q})
    PedidoLog.objects.create(
        pedido=pedido, usuario=user, acao='fardo_op_lido',
        payload={'op': op, 'volume_id': volume.id, 'tipo': tipo, 'itens': lancados},
    )
    return volume, lancados


def desfazer_fardo(pedido: Pedido, volume: Volume, user):
    """Apaga o volume da OP e devolve as quantidades aos itens."""
    with transaction.atomic():
        devolvidos = []
        for vi in volume.itens.select_related('pedido_item'):
            PedidoItem.objects.filter(pk=vi.pedido_item_id).update(
                qtd_separada=models.Case(
                    models.When(qtd_separada__gte=vi.qtd, then=models.F('qtd_separada') - vi.qtd),
                    default=0,
                ),
            )
            devolvidos.append({'item_id': vi.pedido_item_id, 'sku': vi.pedido_item.sku, 'qtd': vi.qtd})
        op, volume_id = volume.op, volume.id
        volume.delete()
        PedidoLog.objects.create(
            pedido=pedido, usuario=user, acao='fardo_op_desfeito',
            payload={'op': op, 'volume_id': volume_id, 'itens': devolvidos},
        )
