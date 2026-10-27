"""Carta de correção: transportadora, frete e quantidade de volumes (ponto 6 da diretoria, 2026-10-22).

Regras (decididas com o usuário em 2026-10-22, sem passar pela diretoria):
  - vale para NF importada como documento E para pedido já faturado — a NF emitida a
    partir do pedido é descoberta pela E140IPV (`Pedido.nf_*`, ver apps/pedidos/nf_vinculo.py);
    pedido ainda sem nota não tem CC-e; documento cancelado também não;
  - a NF precisa estar com situação eletrônica 3 (Autorizada) — regra do Senior/SEFAZ;
    se a consulta ao Oracle não estiver disponível, avisa e deixa o ERP validar;
  - o que pode ser corrigido na mesma carta: transportadora (`codTra`), frete C/F (`cifFob`)
    e quantidade de volumes (`qtdEmb`, padrão = volumes montados no Separa); qualquer
    combinação, mais um complemento livre;
  - texto gerado pelo sistema, SEMPRE repetindo as cartas anteriores da nota, porque a
    última carta substitui todas as outras; desde 2026-10-27 `Configuracao.cce_texto`
    permite `livre` (o sistema sugere o texto montado no campo e o usuário edita, apaga
    ou escreve outro — a diretoria ainda discute o formato), e as anteriores continuam
    sendo repetidas nos dois modos;
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
from apps.pedidos.nf_vinculo import descobrir_nf
from apps.senior.oracle import SENIOR_CODEMP

from . import senior
from .models import CartaCorrecao

logger = logging.getLogger(__name__)

PERFIS_CCE = ('supervisor_vendas', 'supervisor_patio', 'admin')
LIMITE_TEXTO = 999          # String(999) na porta de envio; a SEFAZ aceita até 1000 em xCorrecao
LIMITE_VOLUMES = 999
MODOS = ('desligado', 'gravar', 'gravar_e_transmitir')
TEXTOS = ('montado', 'livre')   # cce_texto: o sistema monta "ONDE SE LE…" | o usuário digita tudo
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


def texto_modo_atual() -> str:
    valor = Configuracao.obter(Configuracao.Chave.CCE_TEXTO) or 'montado'
    return valor if valor in TEXTOS else 'montado'


def configuracao() -> dict:
    from django.conf import settings
    return {
        'modo': modo_atual(),
        'tipger': tipger_atual(),
        'texto': texto_modo_atual(),
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


def montar_texto(base: dict, nova: dict | None, frete_novo: str, vol_novo: int | None, complemento: str,
                 anteriores: list[dict], livre: bool = False) -> str:
    """`base` = o que o documento autorizado diz hoje ({codtra, transportadora, frete, volumes}, ver
    `_baseline`); é o "onde se lê". `vol_novo` = quantidade informada ou None.
    `livre` (cce_texto = livre): o texto é só o que o usuário digitou em `complemento`; as
    correções continuam indo nos campos do Gravar, mas o sistema não escreve nada por ele."""
    partes = []
    if livre:
        nova, frete_novo, vol_novo = None, '', None
    if nova and nova['codtra'] != base['codtra']:
        de = f"'{_ascii_maiusculo(base['transportadora'])}' ({base['codtra']})" if base['codtra'] else 'SEM TRANSPORTADORA'
        partes.append(f"TRANSPORTADORA: ONDE SE LE {de}, LEIA-SE '{_ascii_maiusculo(nova['nome'])}' ({nova['codtra']}).")
    if frete_novo and frete_novo != base['frete']:
        de = FRETE_LABEL.get(base['frete'], 'NAO INFORMADO')
        partes.append(f"FRETE: ONDE SE LE '{de}', LEIA-SE '{FRETE_LABEL[frete_novo]}'.")
    vol_antes = base['volumes']
    if vol_novo is not None and vol_novo != vol_antes:
        de = str(vol_antes) if vol_antes is not None else 'NAO INFORMADO'
        partes.append(f"QUANTIDADE DE VOLUMES: ONDE SE LE {de}, LEIA-SE {vol_novo}.")
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
        # texto novo vazio (modo livre com o campo limpo): sem o ' | ' pendurado na frente
        texto = (texto + SEPARADOR_ANTERIORES if texto else SEPARADOR_ANTERIORES.lstrip(' |')) + ' / '.join(unicos)
    return texto


# ---------------------------------------------------------------------------
# Identificação da NF e elegibilidade
# ---------------------------------------------------------------------------

def identificar_nf(pedido: Pedido) -> tuple[str, str, str] | None:
    """(codfil, codsnf, numnfv) da nota. Pedido ainda sem vínculo → pergunta ao Senior agora
    (E140IPV) e guarda no Pedido. Oracle fora → ErroCarta 503."""
    ident = pedido.identificacao_nf
    if ident or pedido.tipo != Pedido.Tipo.PEDIDO:
        return ident
    try:
        descobrir_nf(pedido)
    except Exception as e:
        raise ErroCarta('oracle_indisponivel', f'Não consegui consultar no Senior se o pedido já tem nota: {e}', http=503)
    return pedido.identificacao_nf


def elegibilidade(pedido: Pedido) -> dict | None:
    """None = elegível; senão {'codigo', 'mensagem'}. Pode levantar ErroCarta (Oracle fora)."""
    if pedido.status == Pedido.Status.CANCELADO:
        return {'codigo': 'cancelado', 'mensagem': 'Documento cancelado no Senior.'}
    # NF como documento: precisa de filial/série/número. Pedido: só o número — a filial da nota
    # vem do vínculo (nf_codfil); pedidos importados antes de `codfil` existir têm codfil vazio.
    if not pedido.numero_externo or (pedido.tipo == Pedido.Tipo.NOTA_FISCAL and not (pedido.codfil and pedido.codsnf)):
        return {'codigo': 'sem_identificacao', 'mensagem': 'Documento sem filial/série/número — não dá para identificar a NF no Senior.'}
    if not identificar_nf(pedido):
        return {'codigo': 'sem_nf', 'mensagem': 'Pedido ainda sem nota fiscal emitida no Senior. A carta de correção só existe depois do faturamento; '
                                                'enquanto é pedido, a transportadora se altera no próprio pedido, no Senior.'}
    return None


def _volumes_separa(pedido: Pedido) -> int:
    return pedido.volumes.count()


def _sincronizar_com_nf(pedido: Pedido, situacao: dict) -> None:
    """A nota é a palavra final sobre transportadora e frete: se o Senior diz outra coisa do que
    o Pedido local guarda (pedido faturado com transportadora definida só na nota, ou troca feita
    direto no ERP), alinha o Pedido antes de montar o texto — senão a carta diria "onde se lê X"
    com um X que a nota já não tem."""
    if not (situacao.get('disponivel') and situacao.get('encontrada')):
        return
    campos = []
    codtra = situacao.get('codtra') or ''
    if codtra and codtra != (pedido.codtra or ''):
        pedido.codtra = codtra
        pedido.transportadora = (situacao.get('nomtra') or f'Transportadora {codtra}')[:255]
        campos += ['codtra', 'transportadora']
    ciffob = (situacao.get('ciffob') or '').upper()
    if ciffob in dict(Pedido.Frete.choices) and ciffob != (pedido.frete or ''):
        pedido.frete = ciffob
        campos.append('frete')
    if campos:
        pedido.save(update_fields=campos)
        logger.info('carta_correcao: pedido alinhado com a NF (%s)', ', '.join(campos), extra={'pedido': pedido.id})


def _cartas_apagadas(pedido: Pedido, ident: tuple, anteriores: dict) -> list[CartaCorrecao]:
    """Cartas efetivas do Separa nesta NF cujo texto não está mais na E140CCE: o fiscal apagou no
    Senior (possível enquanto `sitcce` = 1, "Não enviada"). Apagar a carta NÃO desfaz o que o
    `Gravar` mudou na nota (codtra/ciffob/qtdemb), mas o documento autorizado continua com os
    valores antigos — então o "onde se lê" de uma carta refeita tem que voltar a eles.
    Da mais nova para a mais antiga. Vazio quando a E140CCE não pôde ser lida."""
    if not anteriores.get('disponivel'):
        return []
    textos_senior = {_ascii_maiusculo(c.get('texto') or '') for c in anteriores.get('cartas', [])}
    apagadas = [c for c in pedido.cartas_correcao.all()
                if c.efetiva and (c.nf_codsnf, c.nf_numero) == (ident[1], ident[2])
                and _ascii_maiusculo(c.texto) not in textos_senior]
    return sorted(apagadas, key=lambda c: c.criado_em, reverse=True)


def _baseline(pedido: Pedido, situacao: dict, apagadas: list[CartaCorrecao]) -> dict:
    """O que o documento autorizado diz hoje = valores atuais da nota, desfazendo em memória cada
    carta do Separa que foi apagada no Senior (da mais nova para a mais antiga, só quando a nota
    ainda carrega o valor que aquela carta pôs)."""
    base = {'codtra': pedido.codtra or '', 'transportadora': pedido.transportadora or '',
            'frete': pedido.frete or '', 'volumes': situacao.get('qtdemb')}
    for c in apagadas:
        if c.codtra_novo != c.codtra_anterior and base['codtra'] == c.codtra_novo:
            base['codtra'], base['transportadora'] = c.codtra_anterior, c.transportadora_anterior
        if c.frete_novo != c.frete_anterior and base['frete'] == c.frete_novo:
            base['frete'] = c.frete_anterior
        if c.volumes_novo is not None and base['volumes'] == c.volumes_novo:
            base['volumes'] = c.volumes_anterior
    return base


def _contexto(pedido: Pedido, ident: tuple, situacao: dict | None = None) -> tuple[dict, dict, list, dict]:
    """(situacao, anteriores, apagadas, base) — tudo que previa/executar precisam para montar o texto."""
    if situacao is None:
        situacao = senior.situacao_nf(*ident)
        _sincronizar_com_nf(pedido, situacao)
    anteriores = senior.cartas_anteriores(*ident)
    apagadas = _cartas_apagadas(pedido, ident, anteriores)
    return situacao, anteriores, apagadas, _baseline(pedido, situacao, apagadas)


def preparar(pedido: Pedido) -> dict:
    try:
        bloqueio = elegibilidade(pedido)
    except ErroCarta as e:
        bloqueio = {'codigo': e.codigo, 'mensagem': e.mensagem}
    situacao = {'disponivel': False, 'autorizada': None, 'erro': ''}
    anteriores = {'disponivel': False, 'cartas': [], 'erro': ''}
    apagadas: list[CartaCorrecao] = []
    base = _baseline(pedido, situacao, [])
    ident = pedido.identificacao_nf
    if not bloqueio and ident:
        situacao, anteriores, apagadas, base = _contexto(pedido, ident)
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
        'nf': {'codfil': ident[0], 'codsnf': ident[1], 'numero': ident[2]} if ident else None,
        'volumes': {'nf': situacao.get('qtdemb'), 'separa': _volumes_separa(pedido)},
        # "onde se lê": valores atuais, desfazendo cartas do Separa apagadas no Senior
        'baseline': base,
        'refazer': serializar(apagadas[0]) if apagadas else None,
        'bloqueio': bloqueio,
        'situacao': situacao,
        'cartas_anteriores': anteriores,
        'cartas_separa': [serializar(c) for c in pedido.cartas_correcao.select_related('usuario')[:10]],
        'config': configuracao(),
        'limite_texto': LIMITE_TEXTO,
    }


def _parse_volumes(valor) -> int | None:
    """'' / None = não corrigir. Senão inteiro de 1 a LIMITE_VOLUMES."""
    if valor is None or str(valor).strip() == '':
        return None
    try:
        n = int(str(valor).strip())
    except ValueError:
        raise ErroCarta('volumes_invalido', 'Quantidade de volumes precisa ser um número inteiro.')
    if n < 1 or n > LIMITE_VOLUMES:
        raise ErroCarta('volumes_invalido', f'Quantidade de volumes precisa estar entre 1 e {LIMITE_VOLUMES}.')
    return n


def previa(pedido: Pedido, codtra_novo: str, frete_novo: str, volumes_novo, complemento: str) -> dict:
    nova = _resolver_transportadora(codtra_novo) if str(codtra_novo or '').strip() else None
    vol_novo = _parse_volumes(volumes_novo)
    ident = identificar_nf(pedido)
    anteriores = {'cartas': []}
    base = _baseline(pedido, {}, [])
    if ident:
        _, anteriores, _, base = _contexto(pedido, ident)
    texto = montar_texto(base, nova, frete_novo, vol_novo, complemento, anteriores['cartas'],
                         livre=texto_modo_atual() == 'livre')
    # `sugestao` = só as frases que o sistema montaria para as escolhas atuais (sem complemento,
    # sem anteriores): no modo livre o modal põe isso no campo editável como ponto de partida.
    sugestao = montar_texto(base, nova, frete_novo, vol_novo, '', [])
    return {'texto': texto, 'tamanho': len(texto), 'limite': LIMITE_TEXTO, 'sugestao': sugestao,
            'transportadora_nova': nova,
            'volumes_anterior': base['volumes'], 'volumes_novo': vol_novo, 'baseline': base}


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

def executar(pedido: Pedido, usuario, codtra_novo: str, frete_novo: str, volumes_novo, complemento: str) -> CartaCorrecao:
    modo = modo_atual()
    if modo == 'desligado':
        raise ErroCarta('desligado', 'Carta de correção desligada na configuração (Gestão → Cartas de correção).', http=409)
    bloqueio = elegibilidade(pedido)
    if bloqueio:
        raise ErroCarta(bloqueio['codigo'], bloqueio['mensagem'], http=409)
    nf_codfil, nf_codsnf, nf_numero = pedido.identificacao_nf

    frete_novo = (frete_novo or '').strip().upper()
    if frete_novo and frete_novo not in ('C', 'F'):
        raise ErroCarta('frete_invalido', 'Frete deve ser C (entrega) ou F (retira).')
    complemento = (complemento or '').strip()
    livre = texto_modo_atual() == 'livre'
    if livre and not complemento:
        raise ErroCarta('texto_obrigatorio', 'Texto da carta em modo livre: escreva o texto antes de gravar.')
    nova = _resolver_transportadora(codtra_novo) if str(codtra_novo or '').strip() else None
    vol_novo = _parse_volumes(volumes_novo)

    situacao = senior.situacao_nf(nf_codfil, nf_codsnf, nf_numero)
    if situacao.get('disponivel'):
        if situacao.get('encontrada') is False:
            raise ErroCarta('nf_nao_encontrada', situacao['erro'], http=409)
        if situacao.get('autorizada') is False:
            raise ErroCarta('nf_nao_autorizada',
                            f"A NF está '{situacao.get('sitdoe_label')}' no Senior; só NF Autorizada aceita carta de correção.", http=409)
    _sincronizar_com_nf(pedido, situacao)
    _, anteriores, apagadas, base = _contexto(pedido, (nf_codfil, nf_codsnf, nf_numero), situacao)
    vol_antes = base['volumes']

    # Comparação contra o "onde se lê" (base), não contra o valor cru da nota: depois de uma carta
    # do Separa apagada no Senior, a nota já carrega o valor novo e a carta precisa poder ser refeita.
    muda_transportadora = bool(nova) and nova['codtra'] != base['codtra']
    muda_frete = bool(frete_novo) and frete_novo != base['frete']
    muda_volumes = vol_novo is not None and vol_novo != vol_antes
    if not (muda_transportadora or muda_frete or muda_volumes or complemento):
        raise ErroCarta('sem_mudanca', 'Nada a corrigir: transportadora, frete e volumes são os mesmos e não há texto complementar.')

    texto = montar_texto(base, nova, frete_novo, vol_novo, complemento, anteriores['cartas'], livre=livre)
    if len(texto) > LIMITE_TEXTO:
        raise ErroCarta('texto_longo', f'Texto da carta com {len(texto)} caracteres; o limite é {LIMITE_TEXTO}. Encurte o texto.')

    agora = timezone.localtime()
    payload = {
        'codEmp': str(SENIOR_CODEMP),
        'codFil': str(nf_codfil),
        'codSnf': str(nf_codsnf),
        'numNfv': int(nf_numero),
        'desCor': texto,
        'sitCce': '1',
        'datEve': agora.strftime('%d/%m/%Y'),
        'horEve': agora.strftime('%H:%M'),
    }
    if muda_transportadora:
        payload['codTra'] = nova['codtra']
    if muda_frete:
        payload['cifFob'] = frete_novo
    if muda_volumes:
        payload['qtdEmb'] = str(vol_novo)

    carta = CartaCorrecao(
        pedido=pedido, usuario=usuario,
        modo=CartaCorrecao.Modo.DRY_RUN if senior.dry_run() else modo,
        status=CartaCorrecao.Status.SIMULADA,
        nf_codfil=nf_codfil, nf_codsnf=nf_codsnf, nf_numero=nf_numero,
        codtra_anterior=base['codtra'], transportadora_anterior=base['transportadora'],
        codtra_novo=nova['codtra'] if muda_transportadora else base['codtra'],
        transportadora_nova=nova['nome'] if muda_transportadora else base['transportadora'],
        frete_anterior=base['frete'], frete_novo=frete_novo or base['frete'],
        volumes_anterior=vol_antes if muda_volumes else None, volumes_novo=vol_novo if muda_volumes else None,
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
        campos = []
        if muda_transportadora:
            pedido.codtra = nova['codtra']
            pedido.transportadora = nova['nome']
            campos += ['codtra', 'transportadora']
        if muda_frete:
            pedido.frete = frete_novo
            campos.append('frete')
        if campos:
            pedido.save(update_fields=campos)
        _log(pedido, usuario, carta)
    logger.info('carta_correcao gravada', extra={'pedido': pedido.id, 'carta': carta.id})

    # --- 2) Transmitir (opcional) ----------------------------------------------------
    if modo == 'gravar_e_transmitir':
        cabecalho = {
            'codEmp': SENIOR_CODEMP, 'codFIl': int(nf_codfil), 'codSnf': str(nf_codsnf),
            'numNfv': int(nf_numero),
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
        'nf': carta.nf_numero, 'serie': carta.nf_codsnf,
        'de': carta.transportadora_anterior, 'para': carta.transportadora_nova,
        'codtra_de': carta.codtra_anterior, 'codtra_para': carta.codtra_novo,
        'frete_de': carta.frete_anterior, 'frete_para': carta.frete_novo,
        'volumes_de': carta.volumes_anterior, 'volumes_para': carta.volumes_novo,
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
        'tipo': c.pedido.tipo,
        'nf_numero': c.nf_numero, 'nf_codsnf': c.nf_codsnf,
        'cliente': c.pedido.cliente,
        'modo': c.modo, 'modo_label': c.get_modo_display(),
        'status': c.status, 'status_label': c.get_status_display(),
        'efetiva': c.efetiva,
        'codtra_anterior': c.codtra_anterior, 'transportadora_anterior': c.transportadora_anterior,
        'codtra_novo': c.codtra_novo, 'transportadora_nova': c.transportadora_nova,
        'frete_anterior': c.frete_anterior, 'frete_novo': c.frete_novo,
        'volumes_anterior': c.volumes_anterior, 'volumes_novo': c.volumes_novo,
        'texto': c.texto, 'complemento': c.complemento,
        'cartas_anteriores': c.cartas_anteriores,
        'payload_gravar': c.payload_gravar, 'retorno_gravar': c.retorno_gravar,
        'payload_transmitir': c.payload_transmitir, 'retorno_transmitir': c.retorno_transmitir,
        'erro': c.erro,
        'sitdoe': c.sitdoe, 'protocolo': c.protocolo, 'autorizada_em': c.autorizada_em,
    }
