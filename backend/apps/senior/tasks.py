import datetime as dt
from celery import shared_task
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def enviar_embalagem(self, pedido_id: int):
    """Envia notificação SOAP ao Senior (embalagempfa). Status já foi alterado pelo endpoint."""
    from apps.pedidos.models import Pedido, PedidoLog
    from .soap import notificar_embalagem

    pedido = Pedido.objects.get(pk=pedido_id)

    if pedido.embalagem_enviada_em:
        return

    try:
        notificar_embalagem(pedido.numero_externo)
        pedido.embalagem_enviada_em = timezone.now()
        pedido.save(update_fields=['embalagem_enviada_em'])
        PedidoLog.objects.create(
            pedido=pedido, usuario=None,
            acao='embalagem_enviada', payload={},
        )
    except Exception as exc:
        pedido.embalagem_tentativas += 1
        pedido.embalagem_ultimo_erro = str(exc)
        pedido.save(update_fields=['embalagem_tentativas', 'embalagem_ultimo_erro'])
        raise self.retry(exc=exc)


def _make_aware(value):
    if isinstance(value, dt.datetime) and value.tzinfo is None:
        return timezone.make_aware(value)
    return value or timezone.now()


def _oracle_fetch_safe(query, params=None):
    """Executa fetch no Oracle capturando erros de conexão/configuração."""
    import oracledb
    from .oracle import fetch
    try:
        return fetch(query, params)
    except oracledb.exceptions.NotSupportedError as e:
        logger.error(
            "Oracle thin mode não suporta este servidor (verifier 0x939). "
            "Instale o Oracle Instant Client e rebuilde o container. "
            f"Detalhe: {e}"
        )
        return None
    except Exception as e:
        logger.error(f"Erro ao conectar no Oracle: {e}")
        return None


def _importar_itens_do_pedido(pedido, numped_oracle):
    """Busca itens em E120IPD + E075DER/PRO e popula PedidoItem."""
    from .oracle import QUERY_ITENS_PEDIDO, SENIOR_CODEMP
    from apps.pedidos.models import PedidoItem

    rows = _oracle_fetch_safe(QUERY_ITENS_PEDIDO, [numped_oracle])
    if not rows:
        logger.warning(f"Pedido {numped_oracle} sem itens em E120IPD")
        return 0

    criados = 0
    for r in rows:
        codpro = str(r.get('codpro') or '').strip()
        codder = str(r.get('codder') or '').strip()
        if not codpro:
            continue

        qtd = int(r.get('qtdabe') or 0)
        if qtd <= 0:
            continue

        ean = str(r.get('codbar') or '').strip()
        descricao = str(r.get('despro') or '').strip() or f'{codpro}-{codder}'
        sku = f'{codpro}-{codder}-{SENIOR_CODEMP}'

        PedidoItem.objects.create(
            pedido=pedido,
            sku=sku,
            descricao=descricao[:255],
            ean=ean[:20],
            qtd_pedida=qtd,
            codpro=codpro,
            codder=codder,
            codemp=SENIOR_CODEMP,
        )
        criados += 1
    return criados


@shared_task
def sincronizar_pedidos_oracle():
    """
    Importa pedidos com sitPed=1 (Aberto Total) do Senior como Pendente no Postgres.
    Para cada pedido novo, importa os itens (E120IPD + E075DER + E075PRO).
    Roda a cada 2 minutos via Celery Beat.
    """
    from .oracle import QUERY_PEDIDOS_PENDENTES
    from apps.pedidos.models import Pedido

    rows = _oracle_fetch_safe(QUERY_PEDIDOS_PENDENTES)
    if rows is None:
        return {'erro': 'falha_oracle'}
    if not rows:
        logger.info("sincronizar_pedidos_oracle: nenhuma linha retornada")
        return {'criados': 0, 'atualizados': 0, 'itens_importados': 0}

    logger.info(f"E120PED colunas disponíveis: {list(rows[0].keys())}")
    criados = atualizados = itens_importados = 0

    for row in rows:
        numero = str(row.get('numped') or '').strip()
        if not numero:
            continue

        cliente = str(
            row.get('nomcli') or row.get('codcli') or ''
        ).strip()

        criado_em = _make_aware(row.get('datemi'))

        pedido, created = Pedido.objects.get_or_create(
            numero_externo=numero,
            defaults={
                'cliente': cliente,
                'criado_em': criado_em,
                'status': Pedido.Status.PENDENTE,
            }
        )

        if created:
            criados += 1
            try:
                qtd = _importar_itens_do_pedido(pedido, numero)
                itens_importados += qtd
                logger.info(f"Pedido {numero}: {qtd} item(ns) importado(s)")
            except Exception as exc:
                logger.error(f"Erro importando itens do pedido {numero}: {exc}")
        elif not pedido.cliente and cliente:
            pedido.cliente = cliente
            pedido.save(update_fields=['cliente'])
            atualizados += 1

    logger.info(
        f"sincronizar_pedidos_oracle: {criados} criados, {atualizados} atualizados, "
        f"{itens_importados} itens"
    )
    return {'criados': criados, 'atualizados': atualizados, 'itens_importados': itens_importados}


@shared_task
def monitorar_faturamento():
    """
    Detecta pedidos que o Senior faturou (sitPed=4 Liquidado).
    Para cada pedido nosso em status SEPARADA, verifica o sitPed no Oracle.
    Quando sitPed=4, transita para FATURADO no Postgres.
    Roda a cada 2 minutos via Celery Beat.
    """
    from .oracle import QUERY_SITPED_POR_NUMEROS, fetch
    from apps.pedidos.models import Pedido, PedidoLog
    import oracledb

    pedidos_conferidos = list(
        Pedido.objects.filter(status=Pedido.Status.CONFERINDO)
        .values_list('id', 'numero_externo')
    )

    if not pedidos_conferidos:
        return {'verificados': 0, 'faturados': 0}

    numeros = [n for _, n in pedidos_conferidos]
    placeholders = ','.join([':' + str(i + 1) for i in range(len(numeros))])
    query = QUERY_SITPED_POR_NUMEROS.format(placeholders=placeholders)

    rows = _oracle_fetch_safe(query, numeros)
    if rows is None:
        return {'erro': 'falha_oracle'}

    # sitPed=4 significa Liquidado (faturado pelo Senior)
    faturados_senior = {
        str(r.get('numped', '')).strip()
        for r in rows
        if str(r.get('sitped', '')).strip() == '4'
    }

    faturados = 0
    for pedido_id, numero in pedidos_conferidos:
        if numero not in faturados_senior:
            continue
        Pedido.objects.filter(pk=pedido_id, status=Pedido.Status.CONFERINDO).update(
            status=Pedido.Status.FATURADO,
            faturado_em=timezone.now(),
        )
        PedidoLog.objects.create(
            pedido_id=pedido_id,
            usuario=None,
            acao='faturado_senior',
            payload={'sitped': 4},
        )
        faturados += 1
        logger.info(f"Pedido {numero} faturado pelo Senior → status FATURADO")

    logger.info(f"monitorar_faturamento: {len(pedidos_conferidos)} verificados, {faturados} faturados")
    return {'verificados': len(pedidos_conferidos), 'faturados': faturados}
