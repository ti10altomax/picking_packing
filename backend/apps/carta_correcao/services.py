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
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.models import Configuracao
from apps.pedidos.models import Pedido, PedidoLog
from apps.pedidos.nf_vinculo import descobrir_nf
from apps.senior.oracle import SENIOR_CODEMP

from . import senior
from .models import CartaCorrecao

logger = logging.getLogger(__name__)

# Perfis que PODEM entrar em `Configuracao.cce_perfis`; admin sempre pode (ver perfis_cce()).
PERFIS_CCE = ('supervisor_vendas', 'supervisor_patio', 'admin')
PERFIS_CCE_CONFIGURAVEIS = ('supervisor_vendas', 'supervisor_patio')
LIMITE_TEXTO = 999          # String(999) na porta de envio; a SEFAZ aceita até 1000 em xCorrecao
LIMITE_VOLUMES = 999
MODOS = ('desligado', 'gravar', 'gravar_e_transmitir')
TEXTOS = ('montado', 'livre')   # cce_texto: o sistema monta "ALTERA-SE … PARA:" | o usuário digita tudo
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


def perfis_cce() -> tuple[str, ...]:
    """Quem pode corrigir NF: `Configuracao.cce_perfis` (lista separada por vírgula, só
    supervisor_vendas/supervisor_patio contam; o resto é ignorado) + admin sempre.
    Editável só no Django Admin (2026-10-28) — ver comentário em Configuracao.DEFAULTS."""
    valor = Configuracao.obter(Configuracao.Chave.CCE_PERFIS)
    escolhidos = [p.strip() for p in valor.split(',') if p.strip() in PERFIS_CCE_CONFIGURAVEIS]
    return tuple(dict.fromkeys([*escolhidos, 'admin']))


def pode_corrigir(user) -> bool:
    return getattr(user, 'perfil', None) in perfis_cce()


def configuracao() -> dict:
    from django.conf import settings
    return {
        'modo': modo_atual(),
        'tipger': tipger_atual(),
        'texto': texto_modo_atual(),
        'perfis': list(perfis_cce()),   # só leitura no painel; muda no Django Admin
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
    `_baseline`); só decide o que mudou (o texto não cita o valor antigo desde 2026-11-19:
    "ALTERA-SE … PARA: …", pedido da supervisão). `vol_novo` = quantidade informada ou None.
    `livre` (cce_texto = livre): o texto é só o que o usuário digitou em `complemento`; as
    correções continuam indo nos campos do Gravar, mas o sistema não escreve nada por ele."""
    partes = []
    if livre:
        nova, frete_novo, vol_novo = None, '', None
    if nova and nova['codtra'] != base['codtra']:
        partes.append(f"ALTERA-SE TRANSPORTADORA PARA: {_ascii_maiusculo(nova['nome'])} ({nova['codtra']}).")
    if frete_novo and frete_novo != base['frete']:
        partes.append(f"ALTERA-SE FRETE PARA: {FRETE_LABEL[frete_novo]}.")
    if vol_novo is not None and vol_novo != base['volumes']:
        partes.append(f"ALTERA-SE QUANTIDADE PARA: {vol_novo}.")
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
# Retornos do EmitirCartaCorrecao (2026-11-19)
# Códigos de 5 dígitos começando por 100 são do Senior/SDE, não da SEFAZ (cujas rejeições
# têm 3 dígitos). Os dois vistos em produção na NF 152139:
#   10011 "Não foi possível integrar o documento, verifique o log do SDE" — o SDE não recebeu a
#         carta agora; ela FICA gravada no Senior e pode sair depois (foi autorizada na manhã
#         seguinte). Não é erro final → `aguardando_sde`.
#   10021 "Já existe no sistema um documento com os dados informados e sua situação não permite
#         a reintegração" — a SEFAZ já tem uma carta com essa sequência (duplicata).
# ---------------------------------------------------------------------------

MSG_SEM_PROTOCOLO = ('O Senior aceitou a transmissão; a autorização da SEFAZ costuma chegar em menos de um minuto. '
                     'O Separa confere no eDocs a cada 2 minutos e marca como Transmitida, com o protocolo. '
                     'Não refaça a correção.')


def classificar_rejeicao(cod, msg: str) -> tuple[str, str, str]:
    """(status, fonte, explicação em português) para o par codRej/msgRet do retorno."""
    cod = str(cod or '').strip()
    msg = (msg or '').strip()
    if cod == '10011':
        return (CartaCorrecao.Status.AGUARDANDO_SDE, 'Senior/SDE',
                'o SDE (serviço de documentos eletrônicos do Senior) não recebeu a carta agora. A carta '
                'FICOU GRAVADA no Senior e pode ser transmitida depois, pelo SDE ou pelo faturamento; o Separa '
                'vai conferir a situação dela na E140CCE. Não refaça a correção.')
    if cod == '10021':
        return (CartaCorrecao.Status.ERRO_TRANSMITIR, 'Senior/SDE',
                'a SEFAZ já tem uma carta com esta sequência (duplicata). Em geral a carta anterior desta nota '
                'foi transmitida (ou apagada no Senior depois de transmitida). Confira as cartas da nota no '
                'Senior antes de qualquer nova correção.')
    fonte = 'SEFAZ' if cod.isdigit() and len(cod) == 3 else 'Senior/SDE'
    return (CartaCorrecao.Status.ERRO_TRANSMITIR, fonte, msg or 'tipRet -1')


def _mesmo_texto(a: str, b: str) -> bool:
    return _ascii_maiusculo(a) == _ascii_maiusculo(b)


def _casar_com_senior(carta: CartaCorrecao, cartas_senior: list[dict], reservados: set | None = None) -> dict | None:
    """Linha da E140CCE que corresponde a esta carta do Separa: mesmo texto; senão a mesma
    data/hora do evento que o Separa mandou no Gravar (o fiscal pode ter editado o texto) —
    mas nunca uma linha cujo texto é o de OUTRA carta do Separa (`reservados`), senão duas
    cartas gravadas no mesmo minuto se confundem."""
    # mesmo texto em mais de uma linha (carta reenviada): a autorizada vale mais que as outras
    iguais = [c for c in cartas_senior if _mesmo_texto(c.get('texto') or '', carta.texto)]
    if iguais:
        return sorted(iguais, key=lambda c: (c.get('sitcce') != 3, c.get('sitcce') == senior.SITCCE_ERRO))[0]
    pg = carta.payload_gravar or {}
    for c in cartas_senior:
        if pg.get('datEve') and c.get('data') == pg.get('datEve') and c.get('hora') == pg.get('horEve'):
            if reservados and _ascii_maiusculo(c.get('texto') or '') in reservados:
                continue
            return c
    return None


def _cartas_da_nf(pedido: Pedido, ident: tuple) -> list:
    return [c for c in pedido.cartas_correcao.all()
            if c.efetiva and (c.nf_codsnf, str(c.nf_numero)) == (ident[1], str(ident[2]))]


def _textos_reservados(cartas: list, exceto: CartaCorrecao) -> set:
    return {_ascii_maiusculo(c.texto) for c in cartas if c.id != exceto.id}


# Carta transmitida há mais que isto e que não está nem no ERP nem no eDocs: a SEFAZ não a tem.
# A margem cobre a carta que acabou de sair (a autorização leva ~30 s; o evento entra no eDocs
# na hora do envio).
MARGEM_AUSENTE_MIN = 30


def reconciliar(pedido: Pedido, ident: tuple, anteriores: dict, usuario=None) -> list[CartaCorrecao]:
    """Atualiza as cartas do Separa desta NF com o que o Senior diz — a E140CCE já fundida com o
    eDocs em `senior.cartas_anteriores` (sequência, situação, protocolo). Devolve as que mudaram
    de status. Não faz nada se a E140CCE não pôde ser lida."""
    if not anteriores.get('disponivel'):
        return []
    agora = timezone.now()
    mudadas = []
    cartas = _cartas_da_nf(pedido, ident)
    for carta in cartas:
        linha = _casar_com_senior(carta, anteriores.get('cartas', []), _textos_reservados(cartas, carta))
        campos = ['verificada_em']
        carta.verificada_em = agora
        status_antes = carta.status
        if linha:
            carta.seqeve = linha.get('sequencia')
            carta.sitcce_senior = linha.get('sitcce')
            campos += ['seqeve', 'sitcce_senior']
            if linha.get('sitcce') == 3:
                carta.status = CartaCorrecao.Status.TRANSMITIDA
                if linha.get('protocolo'):
                    carta.protocolo = linha['protocolo'][:30]
                if linha.get('autorizada_em'):
                    carta.autorizada_em = linha['autorizada_em'][:20]
                if status_antes != carta.status:
                    carta.erro = ''
                campos += ['status', 'protocolo', 'autorizada_em', 'erro']
            elif (linha.get('sitcce') in (4, senior.SITCCE_ERRO)
                  and carta.status != CartaCorrecao.Status.ERRO_TRANSMITIR):
                carta.status = CartaCorrecao.Status.ERRO_TRANSMITIR
                carta.erro = (f"{linha.get('sitcce_label')} na transmissão (situação {linha.get('sitcce')} na "
                              'E140CCE do Senior). Acerte no Senior.')
                campos += ['status', 'erro']
            elif (linha.get('sitcce') in (1, 2) and carta.status == CartaCorrecao.Status.TRANSMITIDA
                  and not (carta.protocolo or '').strip()):
                # 2026-11-23: o EmitirCartaCorrecao respondeu "autorizado com sucesso" sem protocolo
                # e a carta continua 'Não enviada' no Senior — não foi autorizada.
                carta.status = CartaCorrecao.Status.AGUARDANDO_SDE
                carta.erro = MSG_SEM_PROTOCOLO
                campos += ['status', 'erro']
        elif (anteriores.get('edocs_disponivel') and carta.transmissao_tentada
              and carta.status in (CartaCorrecao.Status.TRANSMITIDA, CartaCorrecao.Status.AGUARDANDO_SDE)
              and carta.criado_em < agora - timedelta(minutes=MARGEM_AUSENTE_MIN)):
            # 2026-11-23: com o eDocs lido, carta que não casa com nenhuma linha (nem do ERP nem
            # do eDocs) NÃO foi registrada na SEFAZ — o "autorizado com sucesso" do WS era de outra
            # carta, ou o protocolo tinha sido atribuído pela linha regravada no ERP.
            quando = timezone.localtime(agora).strftime('%d/%m %H:%M')
            anterior = (carta.erro or '').strip()
            carta.status = CartaCorrecao.Status.ERRO_TRANSMITIR
            carta.erro = (f'Não consta na SEFAZ (conferido no eDocs em {quando}): este texto não foi registrado '
                          'como carta de correção da nota.' + (f' Retorno original: {anterior}' if anterior else ''))[:2000]
            carta.protocolo = ''
            carta.autorizada_em = ''
            carta.seqeve = None
            carta.sitcce_senior = None
            campos += ['status', 'erro', 'protocolo', 'autorizada_em', 'seqeve', 'sitcce_senior']
        carta.save(update_fields=campos)
        if carta.status != status_antes:
            mudadas.append(carta)
            _log(pedido, usuario, carta, acao='carta_correcao_verificada')
            logger.info('carta_correcao %s: %s → %s pelo Senior/eDocs', carta.id, status_antes, carta.status,
                        extra={'pedido': pedido.id, 'carta': carta.id})
    return mudadas


def reconciliar_nf(pedido: Pedido, ident: tuple) -> list[CartaCorrecao]:
    """Versão para o beat: lê a E140CCE e reconcilia."""
    return reconciliar(pedido, ident, senior.cartas_anteriores(*ident))


def _cartas_sumidas(pedido: Pedido, ident: tuple, anteriores: dict) -> list[CartaCorrecao]:
    """Cartas do Separa que FORAM transmitidas (ou tentadas) e não estão mais na E140CCE. Apagar no
    Senior não desfaz o evento na SEFAZ: a nota não aceita nova carta até reimportar essa."""
    if not anteriores.get('disponivel'):
        return []
    cartas = _cartas_da_nf(pedido, ident)
    linhas = anteriores.get('cartas', [])
    if anteriores.get('edocs_disponivel'):
        # Com o eDocs sabemos o que a SEFAZ tem (2026-11-23): "sumida" é só a carta do Separa que
        # casa com um evento AUTORIZADO que não tem linha na E140CCE. A que não casa com nada não
        # foi registrada na SEFAZ e não segura a sequência (o `reconciliar` a marca como erro).
        sumidas = []
        for c in cartas:
            linha = _casar_com_senior(c, linhas, _textos_reservados(cartas, c)) if c.transmissao_tentada else None
            if linha and linha.get('so_no_edocs'):
                sumidas.append(c)
        return sumidas
    return [c for c in cartas
            if c.transmissao_tentada
            and _casar_com_senior(c, linhas, _textos_reservados(cartas, c)) is None]


def bloqueio_por_cartas(anteriores: dict, sumidas: list) -> dict | None:
    """Por que a nota NÃO pode receber carta nova agora (a SEFAZ exige as cartas em sequência):
    carta anterior ainda não transmitida/autorizada no Senior, carta rejeitada, ou carta do Separa
    transmitida que sumiu da E140CCE (2026-11-19)."""
    for c in anteriores.get('cartas', []):
        seq = c.get('sequencia')
        if c.get('sitcce') in (1, 2):
            return {'codigo': 'carta_pendente_senior', 'sequencia': seq,
                    'mensagem': f"A carta {seq} desta nota está '{c.get('sitcce_label')}' no Senior — ainda não foi "
                                "transmitida/autorizada. Peça ao faturamento para transmitir (ou apagar) essa carta antes "
                                "de gravar outra: a SEFAZ só aceita a próxima depois que a anterior é autorizada."}
        if c.get('sitcce') in (4, 5, senior.SITCCE_ERRO):
            return {'codigo': 'carta_rejeitada_senior', 'sequencia': seq,
                    'mensagem': f"A carta {seq} desta nota está '{c.get('sitcce_label')}' no Senior. Acerte essa carta no "
                                "Senior (reenviar ou excluir) antes de gravar outra."}
    if sumidas:
        c = sumidas[0]
        quando = timezone.localtime(c.criado_em).strftime('%d/%m %H:%M')
        reimportavel = c.status == CartaCorrecao.Status.TRANSMITIDA and bool((c.protocolo or '').strip())
        if reimportavel:
            msg = (f"A carta do Separa de {quando} foi AUTORIZADA na SEFAZ (protocolo {c.protocolo}"
                   f"{', ' + c.autorizada_em if c.autorizada_em else ''}) e não está mais na E140CCE do Senior. "
                   "Apagar a carta no Senior não desfaz o evento na SEFAZ: a próxima carta precisa ser a sequência "
                   "seguinte e repetir essa. Reimporte a carta no Senior (botão abaixo) antes de corrigir de novo.")
        else:
            msg = (f"A carta do Separa de {quando} foi enviada à transmissão (retorno: {c.erro[:160] or c.get_status_display()}) "
                   "e não está mais na E140CCE do Senior. Ela pode ter chegado à SEFAZ mesmo assim — confirme com o "
                   "fiscal (log do SDE ou portal) antes de qualquer nova carta. Se a SEFAZ a autorizou, ela precisa ser "
                   "reimportada no Senior; se não, marque-a como não transmitida no Django Admin.")
        return {'codigo': 'carta_sumiu_senior', 'carta_id': c.id, 'reimportavel': reimportavel, 'mensagem': msg}
    return None


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
    # chave do DANFE e volumes da NF (etiqueta de volume, 2026-11-09)
    from apps.pedidos.nf_vinculo import aplicar_dados_nf  # lazy: evita ciclo
    campos += aplicar_dados_nf(pedido, situacao.get('chvdoe'), situacao.get('qtdemb'))
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
    # Só carta que NUNCA foi à transmissão (2026-11-19): a que foi transmitida/tentada e sumiu é
    # `_cartas_sumidas` → bloqueio, porque a SEFAZ pode tê-la e a sequência não pode ser refeita.
    apagadas = [c for c in pedido.cartas_correcao.all()
                if c.status == CartaCorrecao.Status.GRAVADA and not c.transmissao_tentada
                and (c.nf_codsnf, str(c.nf_numero)) == (ident[1], str(ident[2]))
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
    """(situacao, anteriores, apagadas, base) — tudo que previa/executar precisam para montar o texto.
    De passagem reconcilia as cartas do Separa com a E140CCE (2026-11-19)."""
    if situacao is None:
        situacao = senior.situacao_nf(*ident)
        _sincronizar_com_nf(pedido, situacao)
    anteriores = senior.cartas_anteriores(*ident)
    reconciliar(pedido, ident, anteriores)
    apagadas = _cartas_apagadas(pedido, ident, anteriores)
    return situacao, anteriores, apagadas, _baseline(pedido, situacao, apagadas)


def _bloqueio_sequencia(pedido: Pedido, ident: tuple, anteriores: dict) -> dict | None:
    return bloqueio_por_cartas(anteriores, _cartas_sumidas(pedido, ident, anteriores))


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
        if not bloqueio:
            bloqueio = _bloqueio_sequencia(pedido, ident, anteriores)
    # Reenviar carta completa (2026-11-19): nova carta repetindo o que a nota tem hoje, mesmo sem
    # mudar nada — para quando a SEFAZ ficou com uma carta incompleta (ex.: 152139 sem os volumes).
    pode_reenviar = (not bloqueio and bool(ident) and modo_atual() != 'desligado'
                     and bool(situacao.get('disponivel')) and situacao.get('encontrada') is not False
                     and situacao.get('autorizada') is not False and bool(anteriores.get('disponivel')))
    return {
        'pode_reenviar': pode_reenviar,
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
    bloqueio = _bloqueio_sequencia(pedido, (nf_codfil, nf_codsnf, nf_numero), anteriores)
    if bloqueio:
        raise ErroCarta(bloqueio['codigo'], bloqueio['mensagem'], http=409)
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

    return _gravar_e_transmitir(pedido, usuario, carta, payload, texto, situacao, modo,
                                nova if muda_transportadora else None, frete_novo if muda_frete else '',
                                vol_novo if muda_volumes else None)


def _gravar_e_transmitir(pedido: Pedido, usuario, carta: CartaCorrecao, payload: dict, texto: str, situacao: dict,
                         modo: str, nova: dict | None, frete_novo: str, vol_novo: int | None,
                         acao_log: str = 'carta_correcao') -> CartaCorrecao:
    """Chama o Gravar (e o EmitirCartaCorrecao, conforme o modo), grava o rastro e espelha a
    mudança no Pedido. Usado pelo `executar` e pelo `reenviar`."""
    nf_codfil, nf_codsnf, nf_numero = carta.nf_codfil, carta.nf_codsnf, carta.nf_numero
    muda_transportadora, muda_frete, muda_volumes = bool(nova), bool(frete_novo), vol_novo is not None
    if senior.dry_run():
        carta.save()
        _log(pedido, usuario, carta, acao=acao_log)
        logger.info('carta_correcao simulada (dry-run)', extra={'pedido': pedido.id, 'carta': carta.id})
        return carta

    # --- 1) Gravar -----------------------------------------------------------------
    try:
        retorno = senior.gravar_carta(payload)
    except senior.ErroSenior as e:
        carta.status = CartaCorrecao.Status.ERRO_GRAVAR
        carta.erro = str(e)[:2000]
        carta.save()
        _log(pedido, usuario, carta, acao=acao_log)
        raise ErroCarta('senior_indisponivel', f'Senior não respondeu ao Gravar: {e}', http=502)
    carta.retorno_gravar = _json(retorno)
    if retorno.get('tipoRetorno') != 0 or retorno.get('erroExecucao'):
        carta.status = CartaCorrecao.Status.ERRO_GRAVAR
        carta.erro = (retorno.get('mensagemRetorno') or retorno.get('erroExecucao') or 'tipoRetorno -1')[:2000]
        carta.save()
        _log(pedido, usuario, carta, acao=acao_log)
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
        if muda_volumes:
            # o Gravar já trocou o qtdemb da nota: espelha aqui sem esperar o beat
            pedido.nf_volumes = vol_novo
            campos.append('nf_volumes')
        if campos:
            pedido.save(update_fields=campos)
        _log(pedido, usuario, carta, acao=acao_log)
    logger.info('carta_correcao gravada', extra={'pedido': pedido.id, 'carta': carta.id})
    if muda_volumes or muda_transportadora:
        # Etiqueta de volume: a correção pode ter sido exatamente o que a travava (volumes
        # diferentes da NF, sem transportadora) — Conferido recente sem impressão sai agora.
        from apps.impressao.services import disparar_se_pendente  # lazy: evita ciclo
        try:
            disparar_se_pendente(pedido)
        except Exception:
            logger.exception('etiqueta de volume: falha ao disparar após carta de correção', extra={'pedido': pedido.id})

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
            carta.protocolo = str(r0.get('numPrt') or '').strip()[:30]
            if r0.get('datAut'):
                carta.autorizada_em = f"{r0.get('datAut')} {r0.get('horAut') or ''}".strip()[:20]
            if ok and carta.protocolo:
                carta.status = CartaCorrecao.Status.TRANSMITIDA
            elif ok:
                # 2026-11-23: "autorizado com sucesso" SEM protocolo só quer dizer que o Senior
                # aceitou o pedido; a autorização vem depois pelo SDE (ou não vem — 24 cartas
                # ficaram 'Não enviada' assim). Só a E140CCE confirma: o beat reconcilia.
                carta.status = CartaCorrecao.Status.AGUARDANDO_SDE
                carta.erro = MSG_SEM_PROTOCOLO
            else:
                bruto = (r0.get('msgRet') or ret.get('mensagemRetorno') or ret.get('erroExecucao') or 'tipRet -1')
                status_novo, fonte, explicacao = classificar_rejeicao(r0.get('codRej'), bruto)
                carta.status = status_novo
                carta.erro = (f"{fonte} {r0.get('codRej')}: {explicacao}" if r0.get('codRej') else explicacao)[:2000]
        except senior.ErroSenior as e:
            # sem resposta do WS: a carta pode ou não ter saído — trata como incerta (aguardando)
            carta.status = CartaCorrecao.Status.AGUARDANDO_SDE
            carta.erro = f'Sem resposta do EmitirCartaCorrecao ({str(e)[:300]}). A carta ficou gravada; o Separa vai conferir na E140CCE.'[:2000]
        carta.save()
        _log(pedido, usuario, carta, acao='carta_correcao_transmissao')
        logger.info('carta_correcao transmissão %s', carta.status, extra={'pedido': pedido.id, 'carta': carta.id})
    return carta


def montar_texto_completo(situacao: dict, anteriores: list[dict]) -> str:
    """Texto de uma carta que só REPETE o estado atual da nota (transportadora, frete, volumes) e
    as cartas anteriores — para a SEFAZ ficar com tudo numa carta só."""
    partes = []
    codtra = str(situacao.get('codtra') or '').strip()
    if codtra:
        partes.append(f"ALTERA-SE TRANSPORTADORA PARA: {_ascii_maiusculo(situacao.get('nomtra') or '')} ({codtra}).")
    ciffob = (situacao.get('ciffob') or '').upper()
    if ciffob in FRETE_LABEL:
        partes.append(f"ALTERA-SE FRETE PARA: {FRETE_LABEL[ciffob]}.")
    if situacao.get('qtdemb'):
        partes.append(f"ALTERA-SE QUANTIDADE PARA: {situacao['qtdemb']}.")
    texto = ' '.join(partes)
    vistos = {_ascii_maiusculo(texto)}
    unicos = []
    for c in anteriores:
        t = _ascii_maiusculo(c.get('texto') or '')
        if t and t not in vistos:
            vistos.add(t)
            unicos.append(t)
    if unicos:
        texto = (texto + SEPARADOR_ANTERIORES if texto else '') + ' / '.join(unicos)
    return texto


def reenviar(pedido: Pedido, usuario, complemento: str = '') -> CartaCorrecao:
    """Carta nova repetindo o que a nota tem hoje (2026-11-19). Para quando a SEFAZ ficou com uma
    carta incompleta/errada e o `executar` diria "nada a corrigir". Passa pelos mesmos bloqueios."""
    modo = modo_atual()
    if modo == 'desligado':
        raise ErroCarta('desligado', 'Carta de correção desligada na configuração (Gestão → Cartas de correção).', http=409)
    bloqueio = elegibilidade(pedido)
    if bloqueio:
        raise ErroCarta(bloqueio['codigo'], bloqueio['mensagem'], http=409)
    ident = pedido.identificacao_nf
    nf_codfil, nf_codsnf, nf_numero = ident
    situacao = senior.situacao_nf(nf_codfil, nf_codsnf, nf_numero)
    if not situacao.get('disponivel'):
        raise ErroCarta('oracle_indisponivel', f"Não consegui ler a nota no Senior: {situacao.get('erro')}", http=503)
    if situacao.get('encontrada') is False:
        raise ErroCarta('nf_nao_encontrada', situacao['erro'], http=409)
    if situacao.get('autorizada') is False:
        raise ErroCarta('nf_nao_autorizada', f"A NF está '{situacao.get('sitdoe_label')}' no Senior; só NF Autorizada aceita carta de correção.", http=409)
    _sincronizar_com_nf(pedido, situacao)
    _, anteriores, _, base = _contexto(pedido, ident, situacao)
    if not anteriores.get('disponivel'):
        raise ErroCarta('oracle_indisponivel', 'Não consegui ler as cartas anteriores no Senior — o reenvio precisa delas.', http=503)
    bloqueio = _bloqueio_sequencia(pedido, ident, anteriores)
    if bloqueio:
        raise ErroCarta(bloqueio['codigo'], bloqueio['mensagem'], http=409)
    complemento = (complemento or '').strip()
    texto = montar_texto_completo(situacao, anteriores['cartas'])
    if complemento:
        texto = f"{_ascii_maiusculo(complemento)} {texto}".strip()
    if not texto:
        raise ErroCarta('sem_conteudo', 'A nota não tem transportadora, frete nem volumes para repetir na carta.')
    if len(texto) > LIMITE_TEXTO:
        raise ErroCarta('texto_longo', f'Texto da carta com {len(texto)} caracteres; o limite é {LIMITE_TEXTO}.')
    agora = timezone.localtime()
    payload = {
        'codEmp': str(SENIOR_CODEMP), 'codFil': str(nf_codfil), 'codSnf': str(nf_codsnf), 'numNfv': int(nf_numero),
        'desCor': texto, 'sitCce': '1', 'datEve': agora.strftime('%d/%m/%Y'), 'horEve': agora.strftime('%H:%M'),
    }
    codtra = str(situacao.get('codtra') or '').strip()
    if codtra:
        payload['codTra'] = codtra
    ciffob = (situacao.get('ciffob') or '').upper()
    if ciffob in ('C', 'F'):
        payload['cifFob'] = ciffob
    if situacao.get('qtdemb'):
        payload['qtdEmb'] = str(situacao['qtdemb'])
    carta = CartaCorrecao(
        pedido=pedido, usuario=usuario,
        modo=CartaCorrecao.Modo.DRY_RUN if senior.dry_run() else modo,
        status=CartaCorrecao.Status.SIMULADA,
        nf_codfil=nf_codfil, nf_codsnf=nf_codsnf, nf_numero=nf_numero,
        codtra_anterior=base['codtra'], transportadora_anterior=base['transportadora'],
        codtra_novo=base['codtra'], transportadora_nova=base['transportadora'],
        frete_anterior=base['frete'], frete_novo=base['frete'],
        volumes_anterior=None, volumes_novo=None,
        texto=texto, complemento=complemento or 'REENVIO: carta completa repetindo a nota',
        cartas_anteriores=anteriores['cartas'], payload_gravar=payload,
    )
    return _gravar_e_transmitir(pedido, usuario, carta, payload, texto, situacao, modo, None, '', None,
                                acao_log='carta_correcao_reenvio')


def reimportar(carta: CartaCorrecao, usuario) -> dict:
    """Carta do Separa AUTORIZADA na SEFAZ que sumiu da E140CCE: grava de volta no Senior já como
    autorizada (sitCce 3 + protocolo + data/hora), que é o uso documentado desses campos do Gravar.
    Depois relê a E140CCE para confirmar."""
    if carta.status != CartaCorrecao.Status.TRANSMITIDA or not carta.protocolo:
        raise ErroCarta('nao_reimportavel', 'Só carta autorizada na SEFAZ (com protocolo) pode ser reimportada.')
    ident = (carta.nf_codfil, carta.nf_codsnf, carta.nf_numero)
    anteriores = senior.cartas_anteriores(*ident)
    if not anteriores.get('disponivel'):
        raise ErroCarta('oracle_indisponivel', 'Não consegui ler as cartas da nota no Senior.', http=503)
    reservados = _textos_reservados(_cartas_da_nf(carta.pedido, ident), carta)
    if _casar_com_senior(carta, anteriores['cartas'], reservados):
        reconciliar(carta.pedido, ident, anteriores, usuario)
        return {'ja_estava': True, 'carta': serializar(carta)}
    data_aut, _, hora_aut = (carta.autorizada_em or '').partition(' ')
    pg = carta.payload_gravar or {}
    payload = {
        'codEmp': str(SENIOR_CODEMP), 'codFil': str(carta.nf_codfil), 'codSnf': str(carta.nf_codsnf),
        'numNfv': int(carta.nf_numero), 'desCor': carta.texto, 'sitCce': '3',
        'datEve': pg.get('datEve') or data_aut, 'horEve': pg.get('horEve') or (hora_aut or '00:00'),
        'numPrt': carta.protocolo, 'datAut': data_aut or pg.get('datEve'), 'horAut': hora_aut or '00:00',
    }
    if senior.dry_run():
        PedidoLog.objects.create(pedido=carta.pedido, usuario=usuario, acao='carta_correcao_reimportada',
                                 payload={'carta_id': carta.id, 'simulada': True, 'payload': payload})
        return {'simulada': True, 'payload': payload, 'carta': serializar(carta)}
    try:
        retorno = senior.gravar_carta(payload)
    except senior.ErroSenior as e:
        raise ErroCarta('senior_indisponivel', f'Senior não respondeu ao Gravar: {e}', http=502)
    if retorno.get('tipoRetorno') != 0 or retorno.get('erroExecucao'):
        msg = retorno.get('mensagemRetorno') or retorno.get('erroExecucao') or 'tipoRetorno -1'
        PedidoLog.objects.create(pedido=carta.pedido, usuario=usuario, acao='carta_correcao_reimportada',
                                 payload={'carta_id': carta.id, 'erro': str(msg)[:300], 'payload': payload})
        raise ErroCarta('senior_recusou', f'Senior recusou a reimportação: {msg}', http=409)
    PedidoLog.objects.create(pedido=carta.pedido, usuario=usuario, acao='carta_correcao_reimportada',
                             payload={'carta_id': carta.id, 'protocolo': carta.protocolo, 'payload': payload,
                                      'retorno': _json(retorno)})
    logger.info('carta_correcao %s reimportada no Senior', carta.id, extra={'pedido': carta.pedido_id, 'carta': carta.id})
    anteriores = senior.cartas_anteriores(*ident)
    reconciliar(carta.pedido, ident, anteriores, usuario)
    carta.refresh_from_db()
    return {'ok': True, 'carta': serializar(carta),
            'na_e140cce': _casar_com_senior(carta, anteriores.get('cartas', []), reservados) is not None}


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
        'seqeve': c.seqeve, 'sitcce_senior': c.sitcce_senior, 'verificada_em': c.verificada_em,
        'transmissao_tentada': c.transmissao_tentada,
    }
