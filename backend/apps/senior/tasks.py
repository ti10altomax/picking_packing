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


def _janela_dias() -> int:
    """Janela do sync em dias (Configuracao 'janela_sync_dias'; default 3)."""
    from apps.core.models import Configuracao
    valor = Configuracao.obter(Configuracao.Chave.JANELA_SYNC_DIAS)
    try:
        return max(int(valor), 0)
    except (TypeError, ValueError):
        logger.warning(f"janela_sync_dias inválida ({valor!r}); usando 3")
        return 3


def _importar_itens(pedido, query, params, col_qtd):
    """Busca os itens no Oracle (E120IPD ou E140IPV + E075DER/PRO) e popula PedidoItem."""
    from .oracle import SENIOR_CODEMP
    from apps.pedidos.models import PedidoItem

    rows = _oracle_fetch_safe(query, params)
    if not rows:
        logger.warning(f"{pedido} sem itens no Senior")
        return 0

    criados = 0
    for r in rows:
        codpro = str(r.get('codpro') or '').strip()
        codder = str(r.get('codder') or '').strip()
        if not codpro:
            continue

        qtd = int(r.get(col_qtd) or 0)
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


def _localizar_ou_criar(tipo, numero, codfil, codsnf, cliente, criado_em, frete):
    """Localiza o documento pela identidade Senior (tipo, codfil, codsnf, numero) ou cria.

    Compat: pedidos importados antes de codfil existir ficaram com codfil=''.
    Se não houver linha com o codfil exato, adota a linha legada e preenche o codfil
    em vez de duplicar. Devolve (pedido, criado, atualizado).
    """
    from django.db import IntegrityError
    from apps.pedidos.models import Pedido

    base = Pedido.objects.filter(tipo=tipo, numero_externo=numero, codsnf=codsnf)
    pedido = base.filter(codfil=codfil).first()
    if pedido is None and codfil:
        pedido = base.filter(codfil='').first()

    if pedido is not None:
        campos = []
        if pedido.codfil != codfil:
            pedido.codfil = codfil
            campos.append('codfil')
        if not pedido.cliente and cliente:
            pedido.cliente = cliente
            campos.append('cliente')
        if not pedido.frete and frete:
            pedido.frete = frete
            campos.append('frete')
        if campos:
            pedido.save(update_fields=campos)
        return pedido, False, bool(campos)

    try:
        pedido = Pedido.objects.create(
            tipo=tipo, numero_externo=numero, codfil=codfil, codsnf=codsnf,
            cliente=cliente, criado_em=criado_em, frete=frete,
            status=Pedido.Status.PENDENTE,
        )
    except IntegrityError:
        # sync concorrente (beat + disparo manual) criou primeiro
        pedido = base.get(codfil=codfil)
        return pedido, False, False
    return pedido, True, False


def _sincronizar_fonte(tipo, rows, col_numero, col_qtd, query_itens, params_itens):
    """Importa as linhas de uma fonte (pedidos ou NFs) como Pendente + itens."""
    from apps.pedidos.models import Pedido

    criados = atualizados = itens_importados = 0
    for row in rows:
        numero = str(row.get(col_numero) or '').strip()
        if not numero:
            continue

        codfil = str(row.get('codfil') or '').strip()
        codsnf = str(row.get('codsnf') or '').strip() if tipo == Pedido.Tipo.NOTA_FISCAL else ''
        cliente = str(row.get('nomcli') or row.get('codcli') or '').strip()
        frete = str(row.get('ciffob') or '').strip().upper()[:1]
        criado_em = _make_aware(row.get('datemi'))

        pedido, created, updated = _localizar_ou_criar(
            tipo, numero, codfil, codsnf, cliente, criado_em, frete,
        )

        if created:
            criados += 1
            try:
                qtd = _importar_itens(pedido, query_itens, params_itens(numero, codfil, codsnf), col_qtd)
                itens_importados += qtd
                logger.info(f"{pedido}: {qtd} item(ns) importado(s)")
            except Exception as exc:
                logger.error(f"Erro importando itens de {pedido}: {exc}")
        elif updated:
            atualizados += 1

    return {'criados': criados, 'atualizados': atualizados, 'itens_importados': itens_importados}


@shared_task
def sincronizar_pedidos_oracle():
    """
    Importa do Senior como Pendente no Postgres, dentro da janela configurada:
      - pedidos com sitPed=1 (Aberto Total) — E120PED/E120IPD;
      - notas fiscais de venda com sitNfv=2 e sem pedido de origem — E140NFV/E140IPV.
    Para cada documento novo, importa os itens (+ E075DER + E075PRO).
    Roda a cada 2 minutos via Celery Beat.
    """
    from .oracle import (
        QUERY_PEDIDOS_PENDENTES, QUERY_ITENS_PEDIDO,
        QUERY_NF_PENDENTES, QUERY_ITENS_NF,
    )
    from apps.pedidos.models import Pedido

    janela = _janela_dias()
    fontes = (
        ('pedidos', Pedido.Tipo.PEDIDO, QUERY_PEDIDOS_PENDENTES, 'numped', 'qtdabe',
         QUERY_ITENS_PEDIDO, lambda numero, codfil, codsnf: [numero, codfil]),
        ('notas_fiscais', Pedido.Tipo.NOTA_FISCAL, QUERY_NF_PENDENTES, 'numnfv', 'qtdfat',
         QUERY_ITENS_NF, lambda numero, codfil, codsnf: [numero, codfil, codsnf]),
    )

    resultado = {'janela_dias': janela}
    for chave, tipo, query_lista, col_numero, col_qtd, query_itens, params_itens in fontes:
        rows = _oracle_fetch_safe(query_lista, [janela])
        if rows is None:
            resultado[chave] = {'erro': 'falha_oracle'}
            continue
        if not rows:
            logger.info(f"sincronizar_pedidos_oracle[{chave}]: nenhuma linha retornada")
            resultado[chave] = {'criados': 0, 'atualizados': 0, 'itens_importados': 0}
            continue

        parcial = _sincronizar_fonte(tipo, rows, col_numero, col_qtd, query_itens, params_itens)
        logger.info(
            f"sincronizar_pedidos_oracle[{chave}]: {parcial['criados']} criados, "
            f"{parcial['atualizados']} atualizados, {parcial['itens_importados']} itens"
        )
        resultado[chave] = parcial

    return resultado


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
