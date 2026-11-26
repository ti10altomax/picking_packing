"""Carta de correção automática dos volumes (2026-11-26, pedido do usuário).

Quase toda carta feita à mão é só "ALTERA-SE QUANTIDADE PARA: N" com o N que o Separa sugere
(125 de 127 em 7 dias de produção). Com a opção ligada, o sistema faz essa carta sozinho —
o mesmo `services.executar` do botão Corrigir NF (transmite e, com a autorização, grava) —
quando o documento:

  - está Conferido, concluído DEPOIS que a opção foi ligada (decisão do usuário: as notas que já
    estavam paradas continuam pelo Corrigir NF);
  - tem nota (própria ou vinculada), com o `qtdemb` já lido (`Pedido.nf_volumes`);
  - fechou com uma quantidade de volumes com itens diferente da nota;
  - já tem transportadora e NÃO está em cotação de frete (com cotação a transportadora ainda
    vai mudar: a carta dela leva os volumes junto);
  - ainda não teve tentativa desde a conferência: UMA carta automática por conferência. Se o
    Senior recusar, ou se o Pátio mexer nos volumes depois (Mover itens), o acerto volta a ser
    manual — o sistema não fica mandando evento atrás de evento para a SEFAZ.

Roda em segundo plano (decisão do usuário): o `concluir` só agenda a task
(`tasks.carta_volumes_automatica`); o beat `verificar_cartas_pendentes` chama `varrer()` como
rede de segurança e para os casos em que a condição só fica verdadeira depois (a nota chega,
a transportadora chega, a cotação termina).

Liga/desliga em `Configuracao.cce_volumes_automatica` (Gestão → Cartas de correção, admin);
só vale com o modo `gravar_e_transmitir`. `cce_volumes_automatica_desde` guarda quando foi
ligada. Toda recusa vira `PedidoLog` `carta_automatica_recusada` (aparece no Histórico).
"""
import datetime as dt
import logging

from django.db import connection, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.core.models import Configuracao
from apps.pedidos.models import Pedido, PedidoLog

from .models import CartaCorrecao

logger = logging.getLogger(__name__)

LIMITE_POR_VARREDURA = 10
JANELA_DIAS = 7          # a varredura não olha conferência mais velha que isso
_CLASSE_TRAVA = 26112    # 1º número do pg_advisory_lock (qualquer inteiro fixo, só deste recurso)
ACAO_RECUSADA = 'carta_automatica_recusada'


def configurada() -> bool:
    return Configuracao.obter(Configuracao.Chave.CCE_VOLUMES_AUTOMATICA) == 'sim'


def ligada() -> bool:
    """Opção marcada E carta de correção no modo que transmite."""
    from . import services
    return configurada() and services.modo_atual() == 'gravar_e_transmitir'


def desde() -> dt.datetime | None:
    valor = Configuracao.obter(Configuracao.Chave.CCE_VOLUMES_AUTOMATICA_DESDE)
    quando = parse_datetime(valor) if valor else None
    if quando is not None and timezone.is_naive(quando):
        quando = timezone.make_aware(quando)
    return quando


def configurar(ligar: bool) -> None:
    """Grava a opção; ao LIGAR (estava desligada) marca o instante — só o que for concluído dali
    em diante entra."""
    estava = configurada()
    Configuracao.objects.update_or_create(
        chave=Configuracao.Chave.CCE_VOLUMES_AUTOMATICA, defaults={'valor': 'sim' if ligar else 'nao'})
    if ligar and not estava:
        Configuracao.objects.update_or_create(
            chave=Configuracao.Chave.CCE_VOLUMES_AUTOMATICA_DESDE,
            defaults={'valor': timezone.now().isoformat()})


def _volumes(pedido: Pedido) -> int:
    from apps.impressao.services import qtd_volumes_com_itens
    return qtd_volumes_com_itens(pedido)


def _ja_tentou(pedido: Pedido) -> bool:
    """Desde esta conferência: carta automática, carta manual que mexeu nos volumes, ou recusa."""
    inicio = pedido.conferido_em
    cartas = CartaCorrecao.objects.filter(pedido=pedido, criado_em__gte=inicio)
    if cartas.filter(automatica=True).exists() or cartas.filter(volumes_novo__isnull=False).exists():
        return True
    return PedidoLog.objects.filter(pedido=pedido, acao=ACAO_RECUSADA, criado_em__gte=inicio).exists()


def candidata(pedido: Pedido) -> int | None:
    """Quantidade de volumes a mandar na carta automática, ou None se o documento não entra.
    Só dados locais (nenhuma consulta ao Senior)."""
    if not ligada() or pedido.status != Pedido.Status.CONFERIDO or not pedido.conferido_em:
        return None
    inicio = desde()
    if inicio is None or pedido.conferido_em < inicio:
        return None
    if pedido.em_cotacao or not (pedido.transportadora or '').strip():
        return None
    if pedido.identificacao_nf is None or pedido.nf_volumes is None:
        return None
    n = _volumes(pedido)
    if n <= 0 or n == pedido.nf_volumes:
        return None
    if _ja_tentou(pedido):
        return None
    return n


def agendar(pedido: Pedido) -> bool:
    """Chamado quando o documento vira Conferido: se entra na regra, agenda a task para depois
    do commit. True = a carta vai ser tentada (a tela do conferente avisa)."""
    if candidata(pedido) is None:
        return False
    pedido_id = pedido.id

    def _enfileirar():
        try:
            from .tasks import carta_volumes_automatica
            carta_volumes_automatica.delay(pedido_id)
        except Exception:  # broker fora: o beat pega na varredura
            logger.exception('carta automática: não deu para agendar', extra={'pedido': pedido_id})

    transaction.on_commit(_enfileirar)
    return True


def _recusar(pedido: Pedido, codigo: str, mensagem: str, volumes: int) -> None:
    PedidoLog.objects.create(pedido=pedido, usuario=None, acao=ACAO_RECUSADA, payload={
        'codigo': codigo, 'mensagem': (mensagem or '')[:500], 'volumes': volumes, 'nf_volumes': pedido.nf_volumes,
    })
    logger.warning('carta automática de %s não saiu: %s — %s', pedido.numero_externo, codigo, mensagem,
                   extra={'pedido': pedido.id})


def gerar(pedido_id: int) -> dict:
    """Tenta a carta automática de um documento. A trava (advisory lock do Postgres, por
    documento) impede a task do concluir e a varredura do beat de fazerem a mesma carta — e não
    usa transação em volta do `executar`, que não pode perder o registro de um evento já
    transmitido."""
    from . import services

    with connection.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(%s, %s)', [_CLASSE_TRAVA, pedido_id])
        if not cur.fetchone()[0]:
            return {'resultado': 'ocupado'}
    try:
        pedido = Pedido.objects.filter(pk=pedido_id).first()
        if pedido is None:
            return {'resultado': 'inexistente'}
        n = candidata(pedido)
        if n is None:
            return {'resultado': 'nao_entra'}
        try:
            carta = services.executar(pedido, None, '', '', n, '', automatica=True)
        except services.ErroCarta as e:
            if e.codigo == 'sem_mudanca':
                # A nota já está com essa quantidade no Senior (alguém corrigiu por lá e o
                # `nf_volumes` local estava atrasado): não é recusa, só alinha o documento.
                Pedido.objects.filter(pk=pedido.pk).update(nf_volumes=n)
                return {'resultado': 'sem_mudanca'}
            _recusar(pedido, e.codigo, e.mensagem, n)
            return {'resultado': 'recusada', 'codigo': e.codigo}
        except Exception as e:
            logger.exception('carta automática: erro inesperado', extra={'pedido': pedido_id})
            _recusar(pedido, 'erro_inesperado', str(e), n)
            return {'resultado': 'erro'}
        logger.info('carta automática de %s: %s (volumes %s → %s)', pedido.numero_externo, carta.status,
                    carta.volumes_anterior, carta.volumes_novo, extra={'pedido': pedido_id, 'carta': carta.id})
        return {'resultado': carta.status, 'carta': carta.id}
    finally:
        with connection.cursor() as cur:
            cur.execute('SELECT pg_advisory_unlock(%s, %s)', [_CLASSE_TRAVA, pedido_id])


def varrer() -> dict:
    """Beat: documentos que entram na regra e ainda não tiveram a tentativa (a task do concluir
    não rodou, ou a nota/transportadora chegou depois, ou saíram de cotação)."""
    if not ligada():
        return {'ligada': False}
    inicio = desde()
    if inicio is None:
        return {'ligada': True, 'vistos': 0}
    inicio = max(inicio, timezone.now() - dt.timedelta(days=JANELA_DIAS))
    vistos = feitas = 0
    qs = (Pedido.objects
          .filter(status=Pedido.Status.CONFERIDO, conferido_em__gte=inicio, em_cotacao=False,
                  nf_volumes__isnull=False)
          .exclude(transportadora='')
          .order_by('conferido_em'))
    for pedido in qs:
        if candidata(pedido) is None:
            continue
        vistos += 1
        if gerar(pedido.id).get('resultado') not in ('nao_entra', 'ocupado', 'inexistente', 'sem_mudanca'):
            feitas += 1
        if vistos >= LIMITE_POR_VARREDURA:
            break
    return {'ligada': True, 'vistos': vistos, 'tentadas': feitas}
