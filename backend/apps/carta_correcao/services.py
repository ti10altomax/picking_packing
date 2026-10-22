"""Troca de transportadora com carta de correção (ponto 6 da diretoria, 2026-10-22).

Regras (decididas com o usuário em 2026-10-22, sem passar pela diretoria):
  - só documento `tipo = nota_fiscal` (pedido sem nota não tem CC-e), não cancelado;
  - a NF precisa estar com situação eletrônica 3 (Autorizada) — regra do Senior/SEFAZ;
    se a consulta ao Oracle não estiver disponível, avisa e deixa o ERP validar;
  - texto gerado pelo sistema (+ complemento livre), SEMPRE repetindo as cartas
    anteriores da nota, porque a última carta substitui todas as outras;
  - modo em `Configuracao.cce_modo`: desligado | gravar | gravar_e_transmitir;
    `cce_tipger` (1 gera XML, 2 eDocs) para a transmissão;
  - `SENIOR_WS_DRY_RUN` monta tudo, grava o rastro como `simulada` e não chama o Senior;
  - gravou de verdade → atualiza codtra/transportadora/frete do Pedido local e grava
    `PedidoLog` (`carta_correcao`); a etiqueta de volume pode ser reimpressa na hora.
"""
import logging
import unicodedata

from django.db import transaction
from django.utils import timezone

from apps.core.models import Configuracao
from apps.pedidos.models import Pedido, PedidoLog
from apps.senior.oracle import SENIOR_CODEMP

from . import senior
from .models import CartaCorrecao

logger = logging.getLogger(__name__)

PERFIS_CCE = ('supervisor_vendas', 'supervisor_patio', 'admin')
LIMITE_TEXTO = 999          # String(999) na porta de envio; a SEFAZ aceita até 1000 em xCorrecao
MODOS = ('desligado', 'gravar', 'gravar_e_transmitir')
FRETE_LABEL = {'C': 'POR CONTA DO EMITENTE (CIF)', 'F': 'POR CONTA DO DESTINATARIO (FOB)', 'X': 'SEM FRETE'}
SEPARADOR_ANTERIORES = ' | CORRECOES ANTERIORES MANTIDAS: '


class ErroCarta(Exception):
    def __init__(self, codigo: str, mensagem: str, http=400):
        super().__init__(mensagem)
        self.codigo = codigo
        self.mensagem = mensagem
        self.http = http


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

def modo_atual() -> str:
    valor = Configuracao.obter(Configuracao.Chave.CCE_MODO) or 'desligado'
    return valor if valor in MODOS else 'desligado'


def tipger_atual() -> int:
    valor = Configuracao.obter(Configuracao.Chave.CCE_TIPGER) or '2'
    return int(valor) if str(valor) in ('1', '2', '3') else 2


def configuracao() -> dict:
    from django.conf import settings
    return {
        'modo': modo_atual(),
        'tipger': tipger_atual(),
        'dry_run': senior.dry_run(),
        'wsdl_carta_configurado': bool(getattr(settings, 'SENIOR_WSDL_CARTA_CORRECAO', '')),
        'wsdl_documento_configurado': bool(getattr(settings, 'SENIOR_WSDL_DOCUMENTO_FISCAL', '')),
        'codemp': SENIOR_CODEMP,
    }


# ---------------------------------------------------------------------------
# Texto da carta
# ---------------------------------------------------------------------------

def _ascii_maiusculo(texto: str) -> str:
    """Sem acento, maiúsculo, espaços normalizados — evita surpresa de encoding no XML/ERP."""
    sem_acento = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode('ascii')
    return ' '.join(sem_acento.upper().split())


def montar_texto(pedido: Pedido, nova: dict | None, frete_novo: str, complemento: str, anteriores: list[dict]) -> str:
    partes = []
    if nova and nova['codtra'] != (pedido.codtra or ''):
        de = f"'{_ascii_maiusculo(pedido.transportadora)}' ({pedido.codtra})" if pedido.codtra else 'SEM TRANSPORTADORA'
        partes.append(f"TRANSPORTADORA: ONDE SE LE {de}, LEIA-SE '{_ascii_maiusculo(nova['nome'])}' ({nova['codtra']}).")
    if frete_novo and frete_novo != (pedido.frete or ''):
        de = FRETE_LABEL.get(pedido.frete, 'NAO INFORMADO')
        partes.append(f"FRETE: ONDE SE LE '{de}', LEIA-SE '{FRETE_LABEL[frete_novo]}'.")
    if complemento.strip():
        partes.append(_ascii_maiusculo(complemento))
    texto = ' '.join(partes)
    # Cartas anteriores: sem repetir texto igual (o fiscal costuma reenviar a mesma carta
    # quando a SEFAZ demora) e sem repetir o que a carta nova já diz.
    vistos = {_ascii_maiusculo(texto)}
    unicos = []
    for c in anteriores:
        t = _ascii_maiusculo(c.get('texto') or '')
        if t and t not in vistos:
            vistos.add(t)
            unicos.append(t)
    if unicos:
        texto = texto + SEPARADOR_ANTERIORES + ' / '.join(unicos)
    return texto


# ---------------------------------------------------------------------------
# Preparação (o que a tela mostra antes de confirmar)
# ---------------------------------------------------------------------------

def elegibilidade(pedido: Pedido) -> dict | None:
    """None = elegível; senão {'codigo', 'mensagem'}."""
    if pedido.tipo != Pedido.Tipo.NOTA_FISCAL:
        return {'codigo': 'nao_e_nf', 'mensagem': 'Só notas fiscais aceitam carta de correção. Pedido ainda não faturado: altere a transportadora no pedido, no Senior.'}
    if pedido.status == Pedido.Status.CANCELADO:
        return {'codigo': 'cancelado', 'mensagem': 'Documento cancelado no Senior.'}
    if not pedido.codsnf or not pedido.codfil or not pedido.numero_externo:
        return {'codigo': 'sem_identificacao', 'mensagem': 'Documento sem filial/série/número — não dá para identificar a NF no Senior.'}
    return None


def preparar(pedido: Pedido) -> dict:
    bloqueio = elegibilidade(pedido)
    situacao = {'disponivel': False, 'autorizada': None, 'erro': ''}
    anteriores = {'disponivel': False, 'cartas': [], 'erro': ''}
    if not bloqueio:
        situacao = senior.situacao_nf(pedido.codfil, pedido.codsnf, pedido.numero_externo)
        anteriores = senior.cartas_anteriores(pedido.codfil, pedido.codsnf, pedido.numero_externo)
        if situacao.get('disponivel') and situacao.get('encontrada') is False:
            bloqueio = {'codigo': 'nf_nao_encontrada', 'mensagem': situacao['erro']}
        elif situacao.get('disponivel') and situacao.get('autorizada') is False:
            bloqueio = {'codigo': 'nf_nao_autorizada',
                        'mensagem': f"A NF está '{situacao.get('sitdoe_label') or situacao.get('sitdoe')}' no Senior; só NF Autorizada aceita carta de correção."}
    return {
        'pedido': {
            'id': pedido.id, 'numero_externo': pedido.numero_externo, 'codfil': pedido.codfil, 'codsnf': pedido.codsnf,
            'tipo': pedido.tipo, 'status': pedido.status, 'cliente': pedido.cliente,
            'codtra': pedido.codtra, 'transportadora': pedido.transportadora,
            'frete': pedido.frete, 'frete_label': pedido.get_frete_display() if pedido.frete else '',
        },
        'bloqueio': bloqueio,
        'situacao': situacao,
        'cartas_anteriores': anteriores,
        'cartas_separa': [serializar(c) for c in pedido.cartas_correcao.select_related('usuario')[:10]],
        'config': configuracao(),
        'limite_texto': LIMITE_TEXTO,
    }


def previa(pedido: Pedido, codtra_novo: str, frete_novo: str, complemento: str) -> dict:
    nova = _resolver_transportadora(codtra_novo) if codtra_novo else None
    anteriores = senior.cartas_anteriores(pedido.codfil, pedido.codsnf, pedido.numero_externo)
    texto = montar_texto(pedido, nova, frete_novo, complemento, anteriores['cartas'])
    return {'texto': texto, 'tamanho': len(texto), 'limite': LIMITE_TEXTO, 'transportadora_nova': nova}


def _resolver_transportadora(codtra: str) -> dict:
    codtra = str(codtra or '').strip()
    if not codtra:
        raise ErroCarta('transportadora_obrigatoria', 'Escolha a transportadora nova.')
    try:
        t = senior.transportadora(codtra)
    except Exception as e:
        raise ErroCarta('oracle_indisponivel', f'Não consegui consultar a transportadora no Senior: {e}', http=503)
    if not t:
        raise ErroCarta('transportadora_invalida', f'Transportadora {codtra} não existe no Senior.')
    return t


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------

def executar(pedido: Pedido, usuario, codtra_novo: str, frete_novo: str, complemento: str) -> CartaCorrecao:
    modo = modo_atual()
    if modo == 'desligado':
        raise ErroCarta('desligado', 'Carta de correção desligada na configuração (Gestão → Cartas de correção).', http=409)
    bloqueio = elegibilidade(pedido)
    if bloqueio:
        raise ErroCarta(bloqueio['codigo'], bloqueio['mensagem'], http=409)

    frete_novo = (frete_novo or '').strip().upper()
    if frete_novo and frete_novo not in ('C', 'F'):
        raise ErroCarta('frete_invalido', 'Frete deve ser C (entrega) ou F (retira).')
    complemento = (complemento or '').strip()
    nova = _resolver_transportadora(codtra_novo)
    muda_transportadora = nova['codtra'] != (pedido.codtra or '')
    muda_frete = bool(frete_novo) and frete_novo != (pedido.frete or '')
    if not (muda_transportadora or muda_frete or complemento):
        raise ErroCarta('sem_mudanca', 'Nada a corrigir: a transportadora e o frete são os mesmos e não há texto complementar.')

    situacao = senior.situacao_nf(pedido.codfil, pedido.codsnf, pedido.numero_externo)
    if situacao.get('disponivel'):
        if situacao.get('encontrada') is False:
            raise ErroCarta('nf_nao_encontrada', situacao['erro'], http=409)
        if situacao.get('autorizada') is False:
            raise ErroCarta('nf_nao_autorizada',
                            f"A NF está '{situacao.get('sitdoe_label')}' no Senior; só NF Autorizada aceita carta de correção.", http=409)
    anteriores = senior.cartas_anteriores(pedido.codfil, pedido.codsnf, pedido.numero_externo)
    texto = montar_texto(pedido, nova, frete_novo, complemento, anteriores['cartas'])
    if len(texto) > LIMITE_TEXTO:
        raise ErroCarta('texto_longo', f'Texto da carta com {len(texto)} caracteres; o limite é {LIMITE_TEXTO}. Encurte o complemento.')

    agora = timezone.localtime()
    payload = {
        'codEmp': str(SENIOR_CODEMP),
        'codFil': str(pedido.codfil),
        'codSnf': str(pedido.codsnf),
        'numNfv': int(pedido.numero_externo),
        'desCor': texto,
        'sitCce': '1',
        'datEve': agora.strftime('%d/%m/%Y'),
        'horEve': agora.strftime('%H:%M'),
    }
    if muda_transportadora:
        payload['codTra'] = nova['codtra']
    if muda_frete:
        payload['cifFob'] = frete_novo

    carta = CartaCorrecao(
        pedido=pedido, usuario=usuario,
        modo=CartaCorrecao.Modo.DRY_RUN if senior.dry_run() else modo,
        status=CartaCorrecao.Status.SIMULADA,
        codtra_anterior=pedido.codtra or '', transportadora_anterior=pedido.transportadora or '',
        codtra_novo=nova['codtra'], transportadora_nova=nova['nome'],
        frete_anterior=pedido.frete or '', frete_novo=frete_novo or (pedido.frete or ''),
        texto=texto, complemento=complemento, cartas_anteriores=anteriores['cartas'],
        payload_gravar=payload,
    )

    if senior.dry_run():
        carta.save()
        _log(pedido, usuario, carta)
        logger.info('carta_correcao simulada (dry-run)', extra={'pedido': pedido.id, 'carta': carta.id})
        return carta

    # --- 1) Gravar -----------------------------------------------------------------
    try:
        retorno = senior.gravar_carta(payload)
    except senior.ErroSenior as e:
        carta.status = CartaCorrecao.Status.ERRO_GRAVAR
        carta.erro = str(e)[:2000]
        carta.save()
        _log(pedido, usuario, carta)
        raise ErroCarta('senior_indisponivel', f'Senior não respondeu ao Gravar: {e}', http=502)
    carta.retorno_gravar = _json(retorno)
    if retorno.get('tipoRetorno') != 0 or retorno.get('erroExecucao'):
        carta.status = CartaCorrecao.Status.ERRO_GRAVAR
        carta.erro = (retorno.get('mensagemRetorno') or retorno.get('erroExecucao') or 'tipoRetorno -1')[:2000]
        carta.save()
        _log(pedido, usuario, carta)
        raise ErroCarta('senior_recusou', f'Senior recusou a carta: {carta.erro}', http=409)

    carta.status = CartaCorrecao.Status.GRAVADA
    with transaction.atomic():
        carta.save()
        if muda_transportadora:
            pedido.codtra = nova['codtra']
            pedido.transportadora = nova['nome']
        if muda_frete:
            pedido.frete = frete_novo
        pedido.save(update_fields=['codtra', 'transportadora', 'frete'])
        _log(pedido, usuario, carta)
    logger.info('carta_correcao gravada', extra={'pedido': pedido.id, 'carta': carta.id})

    # --- 2) Transmitir (opcional) ----------------------------------------------------
    if modo == 'gravar_e_transmitir':
        cabecalho = {
            'codEmp': SENIOR_CODEMP, 'codFIl': int(pedido.codfil), 'codSnf': str(pedido.codsnf),
            'numNfv': int(pedido.numero_externo),
            'datEve': payload['datEve'], 'horEve': payload['horEve'],
            'desCor': texto, 'tipGer': tipger_atual(),
        }
        if situacao.get('chvdoe'):
            cabecalho['chvDoe'] = situacao['chvdoe']
        carta.payload_transmitir = cabecalho
        try:
            ret = senior.transmitir_carta(cabecalho)
            carta.retorno_transmitir = _json(ret)
            retornos = ret.get('retornos') or []
            r0 = retornos[0] if retornos else {}
            ok = ret.get('tipoRetorno') == 0 and not ret.get('erroExecucao') and (r0.get('tipRet', 0) == 0)
            carta.sitdoe = r0.get('sitDoe')
            carta.protocolo = str(r0.get('numPrt') or '')[:30]
            if r0.get('datAut'):
                carta.autorizada_em = f"{r0.get('datAut')} {r0.get('horAut') or ''}".strip()[:20]
            if ok:
                carta.status = CartaCorrecao.Status.TRANSMITIDA
            else:
                carta.status = CartaCorrecao.Status.ERRO_TRANSMITIR
                carta.erro = (r0.get('msgRet') or ret.get('mensagemRetorno') or ret.get('erroExecucao') or 'tipRet -1')[:2000]
                if r0.get('codRej'):
                    carta.erro = f"SEFAZ {r0.get('codRej')}: {carta.erro}"
        except senior.ErroSenior as e:
            carta.status = CartaCorrecao.Status.ERRO_TRANSMITIR
            carta.erro = str(e)[:2000]
        carta.save()
        _log(pedido, usuario, carta, acao='carta_correcao_transmissao')
        logger.info('carta_correcao transmissão %s', carta.status, extra={'pedido': pedido.id, 'carta': carta.id})
    return carta


def _json(dados):
    """Resposta do zeep → algo serializável em JSONField (datas/Decimal viram str)."""
    import json
    return json.loads(json.dumps(dados, default=str))


def _log(pedido, usuario, carta: CartaCorrecao, acao='carta_correcao'):
    PedidoLog.objects.create(pedido=pedido, usuario=usuario, acao=acao, payload={
        'carta_id': carta.id, 'status': carta.status, 'modo': carta.modo,
        'de': carta.transportadora_anterior, 'para': carta.transportadora_nova,
        'codtra_de': carta.codtra_anterior, 'codtra_para': carta.codtra_novo,
        'frete_de': carta.frete_anterior, 'frete_para': carta.frete_novo,
        'erro': carta.erro[:300] if carta.erro else '',
        'protocolo': carta.protocolo,
    })


def serializar(c: CartaCorrecao) -> dict:
    return {
        'id': c.id,
        'criado_em': c.criado_em,
        'usuario': c.usuario.username if c.usuario else None,
        'pedido_id': c.pedido_id,
        'numero_externo': c.pedido.numero_externo,
        'cliente': c.pedido.cliente,
        'modo': c.modo, 'modo_label': c.get_modo_display(),
        'status': c.status, 'status_label': c.get_status_display(),
        'efetiva': c.efetiva,
        'codtra_anterior': c.codtra_anterior, 'transportadora_anterior': c.transportadora_anterior,
        'codtra_novo': c.codtra_novo, 'transportadora_nova': c.transportadora_nova,
        'frete_anterior': c.frete_anterior, 'frete_novo': c.frete_novo,
        'texto': c.texto, 'complemento': c.complemento,
        'cartas_anteriores': c.cartas_anteriores,
        'payload_gravar': c.payload_gravar, 'retorno_gravar': c.retorno_gravar,
        'payload_transmitir': c.payload_transmitir, 'retorno_transmitir': c.retorno_transmitir,
        'erro': c.erro,
        'sitdoe': c.sitdoe, 'protocolo': c.protocolo, 'autorizada_em': c.autorizada_em,
    }
