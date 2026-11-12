"""Serviço de impressão das etiquetas de volume (ponto 7 da diretoria, 2026-10-07).

Regras fixas (decididas com o usuário em 2026-10-07):
  - imprime quando o pedido vira **Conferido** (no caso de sobra, isso é no
    fechamento pelo Sup. Pátio);
  - **só imprime se já tiver transportadora** — sem ela o pedido fica em
    "Etiquetas pendentes" e o beat `monitorar_cancelamentos` dispara a impressão
    automática quando o Senior preencher;
  - desde 2026-10-27, **só imprime pedido já faturado** (NF vinculada pela E140IPV,
    `Pedido.nf_*`) — regra ligável em `Configuracao.etiqueta_exige_nf` (default
    `sim`); o beat `vincular_nfs_pedidos` dispara a automática quando a NF chega.
    Documento do tipo NF já é a nota e não é afetado;
  - desde 2026-11-09, **só imprime se a quantidade de volumes do Separa for igual à da
    NF** (`Pedido.nf_volumes` = E140NFV.qtdemb) — diferente, o pedido fica em Etiquetas
    pendentes até a carta de correção ajustar a nota (a CC-e dispara a impressão quando
    iguala). Regra ligável em `Configuracao.etiqueta_exige_volumes` (default `sim`);
    NF sem `qtdemb` conhecido ainda não bloqueia;
  - reimpressão sempre disponível depois (web e mobile).

Ninguém sabe ainda como vai imprimir (quantas impressoras, onde). Por isso o
"o quê" (`etiqueta.py` + `zpl.py`) é separado do "por onde": Zebra de rede,
agente USB (`PrintJob`, módulo congelado reaproveitado) ou navegador (página
HTML 10x15 no frontend). A impressora padrão e o liga/desliga da impressão
automática ficam em `Configuracao`.
"""
import datetime as dt
import logging

from django.db import transaction
from django.db.models import Count, F, Q
from django.utils import timezone

from apps.core.models import Configuracao
from apps.etiquetas.printer import enviar_para_rede  # cliente TCP 9100 (congelado, reaproveitado)
from apps.pedidos.models import Impressora, Pedido, PedidoLog, PrintJob

from .etiqueta import dados_etiquetas, normalizar_modelo
from .models import ImpressaoEtiqueta
from .zpl import gerar_zpl

logger = logging.getLogger(__name__)


class ErroImpressao(Exception):
    def __init__(self, codigo: str, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

def impressora_padrao() -> Impressora | None:
    valor = Configuracao.obter(Configuracao.Chave.IMPRESSORA_PADRAO)
    if not valor or not str(valor).isdigit():
        return None
    return Impressora.objects.filter(pk=int(valor), ativa=True).first()


def impressao_automatica_ligada() -> bool:
    return Configuracao.obter(Configuracao.Chave.ETIQUETA_AUTOMATICA) != 'nao'


def modelo_etiqueta() -> str:
    """Modelo configurado (`padrao` | `compacta`) — ver `etiqueta.MODELOS`."""
    return normalizar_modelo(Configuracao.obter(Configuracao.Chave.ETIQUETA_MODELO))


def etiqueta_exige_nf() -> bool:
    """Pedido só imprime depois de faturado (NF vinculada)? Default sim (2026-10-27)."""
    return Configuracao.obter(Configuracao.Chave.ETIQUETA_EXIGE_NF) != 'nao'


def etiqueta_exige_volumes() -> bool:
    """Só imprime com volumes do Separa iguais aos da NF (`qtdemb`)? Default sim (2026-11-09)."""
    return Configuracao.obter(Configuracao.Chave.ETIQUETA_EXIGE_VOLUMES) != 'nao'


def _janela_dias() -> int:
    try:
        return max(int(Configuracao.obter(Configuracao.Chave.JANELA_SYNC_DIAS)), 1)
    except (TypeError, ValueError):
        return 5


# ---------------------------------------------------------------------------
# Elegibilidade
# ---------------------------------------------------------------------------

def verificar_elegivel(pedido: Pedido, *, exige_nf: bool | None = None,
                       exige_volumes: bool | None = None, qtd_volumes: int | None = None) -> None:
    """Levanta ErroImpressao se o pedido não pode ter etiqueta agora.

    `exige_nf`/`exige_volumes` permitem passar a configuração já lida (listas); None = lê
    agora. `qtd_volumes` = volumes com itens já contados (evita a query por linha).
    A NF é checada antes da transportadora: quando a regra está ligada, é ela
    que falta de verdade — e a transportadora costuma chegar junto com a nota.
    Por último os volumes: só comparáveis com NF e `qtdemb` conhecidos.
    """
    if pedido.status == Pedido.Status.CANCELADO:
        raise ErroImpressao('pedido_cancelado', 'documento cancelado no Senior — não imprime etiqueta')
    if pedido.status != Pedido.Status.CONFERIDO:
        raise ErroImpressao(
            'nao_conferido',
            f'etiqueta só depois da conferência concluída (status atual: "{pedido.get_status_display()}")',
        )
    if exige_nf is None:
        exige_nf = etiqueta_exige_nf()
    if exige_nf and pedido.identificacao_nf is None:
        raise ErroImpressao(
            'sem_nf',
            'pedido ainda sem nota fiscal emitida no Senior — a etiqueta fica pendente até faturar',
        )
    if not (pedido.transportadora or '').strip():
        raise ErroImpressao(
            'sem_transportadora',
            'documento ainda sem transportadora no Senior — a etiqueta fica pendente até ela chegar',
        )
    if exige_volumes is None:
        exige_volumes = etiqueta_exige_volumes()
    if exige_volumes and pedido.identificacao_nf is not None and pedido.nf_volumes is not None:
        if qtd_volumes is None:
            qtd_volumes = qtd_volumes_com_itens(pedido)
        if qtd_volumes != pedido.nf_volumes:
            raise ErroImpressao(
                'volumes_divergentes',
                f'a NF está com {pedido.nf_volumes} volume(s) e a conferência fechou {qtd_volumes} — '
                'corrija os volumes da nota (carta de correção) antes de imprimir',
            )


def motivo_bloqueio(pedido: Pedido, *, exige_nf: bool | None = None,
                    exige_volumes: bool | None = None, qtd_volumes: int | None = None) -> dict | None:
    try:
        verificar_elegivel(pedido, exige_nf=exige_nf, exige_volumes=exige_volumes, qtd_volumes=qtd_volumes)
    except ErroImpressao as e:
        return {'codigo': e.codigo, 'mensagem': e.mensagem}
    return None


def filtro_pronta() -> Q:
    """Q equivalente a `motivo_bloqueio(p) is None` num queryset de Conferidos anotado por
    `anotar_volumes` (contagens do painel Agora; `pendentes_qs` já vem anotado)."""
    q = Q(transportadora__gt='')
    if etiqueta_exige_nf():
        q &= Q(tipo=Pedido.Tipo.NOTA_FISCAL) | Q(nf_numero__gt='')
    if etiqueta_exige_volumes():
        q &= Q(nf_volumes__isnull=True) | Q(nf_volumes=F('n_volumes'))
    return q


def anotar_volumes(qs):
    """`n_volumes` = volumes com itens (o que `qtd_volumes_com_itens` conta, em SQL)."""
    return qs.annotate(n_volumes=Count('volumes', filter=Q(volumes__itens__isnull=False), distinct=True))


# ---------------------------------------------------------------------------
# Impressão
# ---------------------------------------------------------------------------

def _registrar(pedido, *, canal, status, impressora=None, qtd=0, automatica=False,
               usuario=None, erro='', print_job=None) -> ImpressaoEtiqueta:
    reg = ImpressaoEtiqueta.objects.create(
        pedido=pedido, impressora=impressora, canal=canal, status=status,
        qtd_etiquetas=qtd, automatica=automatica, usuario=usuario, erro=erro, print_job=print_job,
    )
    acao = {
        ImpressaoEtiqueta.Status.OK: 'etiqueta_impressa',
        ImpressaoEtiqueta.Status.NA_FILA: 'etiqueta_enfileirada',
    }.get(status, 'etiqueta_erro')
    PedidoLog.objects.create(
        pedido=pedido, usuario=usuario, acao=acao,
        payload={
            'canal': canal, 'modelo': modelo_etiqueta(),
            'impressora': impressora.nome if impressora else None,
            'impressora_id': impressora.id if impressora else None,
            'qtd_etiquetas': qtd, 'automatica': automatica, 'erro': erro or None,
        },
    )
    return reg


def imprimir(pedido: Pedido, *, impressora: Impressora | None = None, canal: str | None = None,
             usuario=None, automatica: bool = False) -> ImpressaoEtiqueta:
    """Gera e despacha as etiquetas do pedido.

    - `impressora` de rede → ZPL direto na porta TCP;
    - `impressora` USB → `PrintJob` para o agente puxar;
    - `canal='navegador'` → só registra (o HTML já foi impresso pelo usuário).
    Erros de rede viram registro `erro` (não levantam) para o histórico mostrar.
    """
    completar_dados_nf(pedido)
    verificar_elegivel(pedido)
    dados = dados_etiquetas(pedido, modelo_etiqueta())
    qtd = len(dados['etiquetas'])
    if not qtd:
        raise ErroImpressao('sem_volumes', 'pedido sem volume com itens — nada para imprimir')

    if canal == ImpressaoEtiqueta.Canal.NAVEGADOR:
        return _registrar(
            pedido, canal=ImpressaoEtiqueta.Canal.NAVEGADOR, status=ImpressaoEtiqueta.Status.OK,
            qtd=qtd, automatica=False, usuario=usuario,
        )
    if impressora is None:
        raise ErroImpressao('sem_impressora', 'informe a impressora ou use o navegador')
    if not impressora.ativa:
        raise ErroImpressao('impressora_inativa', f'impressora "{impressora.nome}" está desativada')

    zpl = gerar_zpl(
        dados, dpi=impressora.dpi or 203,
        largura_mm=impressora.largura_mm or 100, altura_mm=impressora.altura_mm or 150,
    ).encode('latin-1', errors='replace')

    if impressora.tipo_conexao == Impressora.TipoConexao.REDE:
        if not impressora.ip:
            return _registrar(
                pedido, canal=ImpressaoEtiqueta.Canal.REDE, status=ImpressaoEtiqueta.Status.ERRO,
                impressora=impressora, qtd=qtd, automatica=automatica, usuario=usuario,
                erro='impressora sem IP cadastrado',
            )
        try:
            enviar_para_rede(impressora.ip, impressora.porta or 9100, zpl)
        except OSError as e:
            logger.warning(f'etiqueta {pedido}: falha TCP {impressora.ip}:{impressora.porta} — {e}')
            return _registrar(
                pedido, canal=ImpressaoEtiqueta.Canal.REDE, status=ImpressaoEtiqueta.Status.ERRO,
                impressora=impressora, qtd=qtd, automatica=automatica, usuario=usuario,
                erro=f'sem resposta em {impressora.ip}:{impressora.porta} ({e})',
            )
        return _registrar(
            pedido, canal=ImpressaoEtiqueta.Canal.REDE, status=ImpressaoEtiqueta.Status.OK,
            impressora=impressora, qtd=qtd, automatica=automatica, usuario=usuario,
        )

    # USB via agente: enfileira; o agente local (agente/separa_agente.py) puxa em
    # /etiquetas/agents/jobs/ e confirma em .../ack/. Fica `na_fila` até o ack
    # (`confirmar_job`, via signal do PrintJob) — desde 2026-11-11; antes contava `ok` aqui.
    with transaction.atomic():
        job = PrintJob.objects.create(impressora=impressora, conteudo=zpl)
        return _registrar(
            pedido, canal=ImpressaoEtiqueta.Canal.AGENTE, status=ImpressaoEtiqueta.Status.NA_FILA,
            impressora=impressora, qtd=qtd, automatica=automatica, usuario=usuario, print_job=job,
        )


def confirmar_job(job: PrintJob) -> ImpressaoEtiqueta | None:
    """Fecha o registro `na_fila` ligado ao `PrintJob` conforme o ack do agente USB:
    `retirado` → `ok` (etiqueta impressa de verdade), `erro` → `erro` (o pedido volta para
    Gestão → Etiquetas com o motivo). Chamado pelo signal de `PrintJob` (apps/impressao/signals.py)
    porque a view `ack_job` é do módulo congelado e não é alterada. Idempotente."""
    if job.status == PrintJob.Status.PENDENTE:
        return None
    reg = (
        ImpressaoEtiqueta.objects
        .filter(print_job=job, status=ImpressaoEtiqueta.Status.NA_FILA)
        .select_related('pedido', 'impressora')
        .first()
    )
    if reg is None:
        return None
    ok = job.status == PrintJob.Status.RETIRADO
    reg.status = ImpressaoEtiqueta.Status.OK if ok else ImpressaoEtiqueta.Status.ERRO
    reg.erro = '' if ok else (job.erro or 'o agente devolveu erro sem detalhe')
    reg.save(update_fields=['status', 'erro'])
    agente = None
    if reg.impressora and reg.impressora.agent_id:
        from apps.pedidos.models import PrintAgent
        agente = PrintAgent.objects.filter(token=reg.impressora.agent_id).values_list('hostname', flat=True).first()
    PedidoLog.objects.create(
        pedido=reg.pedido, usuario=None,
        acao='etiqueta_impressa' if ok else 'etiqueta_erro',
        payload={
            'canal': reg.canal, 'impressora': reg.impressora.nome if reg.impressora else None,
            'impressora_id': reg.impressora_id, 'qtd_etiquetas': reg.qtd_etiquetas,
            'automatica': reg.automatica, 'agente': agente, 'print_job_id': job.id,
            'erro': reg.erro or None,
        },
    )
    logger.info(
        f'etiqueta {reg.pedido}: agente {agente or "?"} {"imprimiu" if ok else "falhou"} o job {job.id}'
        + ('' if ok else f' — {reg.erro}'),
        extra={'pedido': reg.pedido_id, 'print_job': job.id},
    )
    return reg


def completar_dados_nf(pedido: Pedido) -> bool:
    """NF conhecida mas sem chave do DANFE ou volumes lidos (vínculo anterior a 2026-11-09,
    Conferido fora da janela do beat, DANFE transmitido depois): relê no Senior na hora, para
    a barra do DANFE e a regra dos volumes valerem já nesta etiqueta — vale para a Zebra, o
    ZPL e a página do navegador. Oracle fora → segue com o que tem. True = algo mudou."""
    if pedido.identificacao_nf is None or (pedido.nf_volumes is not None and pedido.nf_chave):
        return False
    from apps.pedidos.nf_vinculo import atualizar_nf_senior  # lazy: evita ciclo
    try:
        return atualizar_nf_senior(pedido)
    except Exception as e:
        logger.warning(f'etiqueta {pedido}: não deu para reler a NF no Senior ({e})')
        return False


def qtd_volumes_com_itens(pedido: Pedido) -> int:
    return pedido.volumes.filter(itens__isnull=False).distinct().count()


def disparar_automatica(pedido: Pedido) -> dict:
    """Decide e, se der, enfileira a impressão automática (chamado ao virar Conferido
    e quando o beat preenche a transportadora). Devolve o veredito para a tela
    do conferente mostrar o que aconteceu.
    """
    base = {'qtd_volumes': qtd_volumes_com_itens(pedido), 'impressora': None}
    if not impressao_automatica_ligada():
        return {**base, 'resultado': 'desligada'}
    bloqueio = motivo_bloqueio(pedido)
    if bloqueio:
        return {**base, 'resultado': bloqueio['codigo'], 'mensagem': bloqueio['mensagem']}
    imp = impressora_padrao()
    if imp is None:
        return {
            **base, 'resultado': 'sem_impressora_padrao',
            'mensagem': 'nenhuma impressora padrão configurada — imprima pelo botão',
        }
    try:
        from .tasks import imprimir_etiquetas
        imprimir_etiquetas.delay(pedido.id, imp.id)
    except Exception as e:  # broker fora do ar etc. — não derruba o concluir
        logger.exception(f'etiqueta {pedido}: falha ao enfileirar impressão automática')
        return {**base, 'resultado': 'erro', 'impressora': imp.nome, 'mensagem': str(e)}
    return {**base, 'resultado': 'enfileirada', 'impressora': imp.nome, 'impressora_id': imp.id}


def disparar_se_pendente(pedido: Pedido) -> dict | None:
    """Versão para os beats (transportadora ou NF que acabou de chegar): só dispara
    se o pedido é Conferido **recente** (dentro da janela do sync) e ainda não teve
    impressão `ok` — nunca reimprime sozinho.

    Os beats já só percorrem Conferidos da janela e só chamam aqui no instante em que
    a NF/transportadora chega (depois disso o pedido sai do universo deles), então
    ligar a impressão automática mais tarde não dispara o acumulado. A checagem da
    janela aqui é a garantia disso independente de quem chama.
    """
    if pedido.status != Pedido.Status.CONFERIDO:
        return None
    limite = timezone.now() - dt.timedelta(days=_janela_dias())
    if not pedido.conferido_em or pedido.conferido_em < limite:
        return None
    if pedido.impressoes_etiqueta.filter(
        status__in=[ImpressaoEtiqueta.Status.OK, ImpressaoEtiqueta.Status.NA_FILA],
    ).exists():
        return None
    return disparar_automatica(pedido)


# ---------------------------------------------------------------------------
# Pendentes
# ---------------------------------------------------------------------------

def na_fila_do_agente(pedido: Pedido) -> ImpressaoEtiqueta | None:
    """Registro `na_fila` mais recente do pedido (job esperando o agente USB), ou None."""
    return (
        pedido.impressoes_etiqueta.filter(status=ImpressaoEtiqueta.Status.NA_FILA)
        .select_related('impressora').order_by('-criado_em').first()
    )


def pendentes_qs():
    """Conferidos dentro da janela do sync sem nenhuma impressão `ok`.

    Pedido com job `na_fila` do agente USB continua aqui (ainda não há etiqueta na caixa);
    a view marca `na_fila` para a tela mostrar "na fila do agente" em vez de convidar a
    imprimir de novo.

    Retira/sem frete sem transportadora nunca vão ter etiqueta (não existe
    transportadora) e ficam de fora; entrega (CIF) sem transportadora entra como
    "aguardando Senior". Quem está "pronta" × "aguardando" é `motivo_bloqueio`
    (transportadora e, com `etiqueta_exige_nf`, NF vinculada).
    """
    limite = timezone.now() - dt.timedelta(days=_janela_dias())
    return anotar_volumes(
        Pedido.objects
        .filter(status=Pedido.Status.CONFERIDO, conferido_em__gte=limite)
        .exclude(impressoes_etiqueta__status=ImpressaoEtiqueta.Status.OK)
        .filter(Q(transportadora__gt='') | Q(frete=Pedido.Frete.CIF))
        .select_related('conferente', 'sequencia')
        .order_by('conferido_em')
        .distinct()
    )
