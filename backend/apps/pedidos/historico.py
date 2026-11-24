"""Linha do tempo do pedido para pessoas (observabilidade, 2026-10-08).

O `PedidoLog` já guarda tudo (quem, quando, ação, payload) desde o primeiro
commit — só nunca teve tela. Aqui cada `acao` ganha título em português e uma
descrição montada do payload, para o supervisor ler "o que aconteceu com esse
documento" sem abrir o Django admin.

`tipo` agrupa para a UI colorir: fluxo (mudança de etapa), bip, alerta
(divergência, falta, sobra, NC, cancelamento, erro de etiqueta), etiqueta,
legado (ações do escopo congelado).
"""
from .models import Pedido, PedidoLog

MOTIVOS_NC = dict(Pedido.MotivoNaoConforme.choices)
STATUS = dict(Pedido.Status.choices)


def _vol(p):
    return f"{p.get('tipo') or 'volume'} {p.get('identificador') or ''}".strip()


def _reorganizados(p):
    m = p.get('movidos') or []
    d = p.get('destino') or {}
    alvo = f"{d.get('tipo') or 'volume'} {d.get('identificador') or ''}".strip() + (' (novo)' if d.get('novo') else '')
    txt = f"{len(m)} lançamento(s) → {alvo}: " + ', '.join(f"{x.get('sku')} ×{x.get('qtd')}" for x in m[:6])
    if len(m) > 6:
        txt += f' e mais {len(m) - 6}'
    if p.get('volumes_apagados'):
        txt += f" · {len(p['volumes_apagados'])} volume(s) vazio(s) apagado(s)"
    if p.get('durante_conferencia'):
        txt += ' · pelo conferente, durante a conferência'
    return txt


def _sobras(p):
    return ', '.join(f"{s.get('sku')} +{s.get('qtd')}" for s in p.get('sobras', []) if isinstance(s, dict))


def _faltas(p):
    faltas = p.get('faltas', [])
    if isinstance(faltas, list) and faltas and isinstance(faltas[0], dict):
        return ', '.join(f"{f.get('sku')} −{f.get('qtd')}" for f in faltas)
    return f'{len(faltas)} item(ns)' if isinstance(faltas, list) else ''


def _atribuido(p):
    txt = p.get('conferente') or ''
    if p.get('via') == 'bipagem':
        txt += ' — pegou bipando a nota'
    if p.get('reatribuicao'):
        txt += ' (reatribuição)'
    if p.get('numero'):
        txt += f" · sequência {p.get('numero')}"
    return txt.strip(' ·')


def _cancelado(p):
    origem = 'no Senior' if p.get('origem') == 'senior' else 'pelo supervisor'
    anterior = STATUS.get(p.get('status_anterior'), p.get('status_anterior'))
    txt = f'{origem}'
    if anterior:
        txt += f' · estava {anterior}'
    if p.get('situacao_senior'):
        txt += f" · situação {p.get('situacao_senior')}"
    return txt


def _carta(p):
    st = {'simulada': 'simulada (dry-run)', 'gravada': 'gravada no Senior, não enviada', 'transmitida': 'transmitida à SEFAZ',
          'aguardando_sde': 'gravada, aguardando transmissão (SDE)',
          'erro_gravar': 'recusada/falhou ao gravar', 'erro_transmitir': 'gravada, falhou ao transmitir'}.get(p.get('status'), p.get('status') or '')
    txt = st
    if p.get('nf'):
        txt += f" · NF {p.get('nf')}"
    if p.get('para') and p.get('para') != p.get('de'):
        txt += f" · {p.get('de') or 'sem transportadora'} → {p.get('para')}"
    if p.get('frete_para') and p.get('frete_para') != p.get('frete_de'):
        txt += f" · frete {p.get('frete_de') or '?'} → {p.get('frete_para')}"
    if p.get('volumes_para') is not None:
        txt += f" · volumes {p.get('volumes_de') if p.get('volumes_de') is not None else '?'} → {p.get('volumes_para')}"
    if p.get('protocolo'):
        txt += f" · protocolo {p.get('protocolo')}"
    if p.get('erro'):
        txt += f" — {p.get('erro')}"
    return txt


def _etiqueta(p):
    txt = f"{p.get('qtd_etiquetas') or '?'} etiqueta(s) · {p.get('impressora') or p.get('canal') or ''}"
    if p.get('volumes'):
        txt += f" · só volumes {p.get('volumes')}"
    if p.get('automatica'):
        txt += ' · automática'
    if p.get('agente'):
        txt += f" · agente {p.get('agente')}"
    return txt


def _nc(p):
    txt = MOTIVOS_NC.get(p.get('motivo'), p.get('motivo') or '')
    if p.get('detalhe'):
        txt += f" — {p.get('detalhe')}"
    return txt


def _quando(iso):
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime
    d = parse_datetime(iso) if iso else None
    return timezone.localtime(d).strftime('%d/%m %H:%M') if d else ''


def _embarque(p):
    txt = f"embarque {p.get('embarque') or '?'}"
    if p.get('placa'):
        txt += f" · placa {p.get('placa')}"
    if p.get('motorista'):
        txt += f" · {p.get('motorista')}"
    saida = _quando(p.get('embarcado_em'))
    if saida:
        txt += f' · saída {saida}'
    return txt


def _embarcado(p):
    txt = _embarque(p)
    if p.get('sem_conferencia'):
        anterior = STATUS.get(p.get('status_anterior'), p.get('status_anterior') or '')
        txt += f' · saiu sem conferência (estava {anterior})'
    return txt


def _embarque_desfeito(p):
    txt = f"a nota saiu do embarque {p.get('embarque') or '?'} no Senior"
    volta = STATUS.get(p.get('status'), p.get('status') or '')
    if volta and not p.get('so_aviso'):
        txt += f' · voltou a {volta}'
    return txt


def _retomado(p):
    if p.get('modo') == 'sequencia':
        if p.get('numero'):
            txt = f"solto na sequência {p.get('numero')} para outro conferente pegar"
        else:
            txt = 'sem sequência — voltou para o Pátio sequenciar'
    else:
        txt = f"voltou para {p.get('conferente') or 'o conferente'}"
    motivo = MOTIVOS_NC.get(p.get('motivo_anterior'), p.get('motivo_anterior') or '')
    if motivo:
        txt += f' · era {motivo}'
    return txt


# acao → (título, tipo, descrição(payload))
ROTULOS = {
    'pedido_selecionado': ('Selecionado para separação', 'fluxo', lambda p: ''),
    'pedido_sequenciado': ('Entrou na sequência', 'fluxo', lambda p: f"sequência {p.get('numero')}"),
    'pedido_removido_sequencia': ('Removido da sequência', 'fluxo', lambda p: f"sequência {p.get('numero')}"),
    'pedido_atribuido': ('Atribuído ao conferente', 'fluxo', _atribuido),
    'atribuicao_devolvida': ('Devolvido pelo conferente', 'alerta',
                             lambda p: f"{p.get('conferente') or 'conferente'} devolveu — voltou a Selecionado"
                                       + (f" na sequência {p.get('numero')}" if p.get('numero') else '')),
    'conferencia_iniciada': ('Conferência iniciada', 'fluxo',
                             lambda p: f"separado por {p.get('separado_por')}" if p.get('separado_por') else 'separador não identificado'),
    'separado_por_alterado': ('Separador alterado', 'fluxo', lambda p: p.get('separado_por') or ''),
    'volume_criado': ('Volume aberto', 'fluxo', _vol),
    'volume_removido': ('Volume removido', 'alerta', _vol),
    'volumes_reorganizados': ('Volumes reorganizados', 'alerta', _reorganizados),
    'item_bipado': ('Item bipado', 'bip',
                    lambda p: f"{p.get('sku')} × {p.get('qtd')} · total {p.get('qtd_separada_total')}"
                              + (f" · barra errada {p.get('codigo_lido')} (código alternativo)" if p.get('codigo_lido') else '')),
    'bip_manual': ('Bip manual', 'bip', lambda p: f"{p.get('sku') or ''} × {p.get('qtd') or ''}".strip(' ×')),
    'bip_codigo_divergente': ('Código divergente', 'alerta',
                              lambda p: f"{p.get('codigo')} não bate com {p.get('sku')}"),
    'divergencia_liberada': ('Divergência liberada pelo supervisor', 'alerta',
                             lambda p: f"{p.get('sku')} × {p.get('qtd')}" + (f" — {p.get('observacao')}" if p.get('observacao') else '')),
    'volume_item_removido': ('Item tirado do volume', 'alerta',
                             lambda p: f"{p.get('sku') or ''} × {p.get('qtd') or ''}".strip(' ×')),
    'item_cancelado': ('Item cancelado', 'alerta', lambda p: p.get('sku') or ''),
    'item_falta': ('Item marcado em falta', 'alerta', lambda p: p.get('sku') or ''),
    'sobra_registrada': ('Sobra registrada', 'alerta', _sobras),
    'conferencia_aguardando_fechamento': ('Aguardando fechamento da sobra', 'fluxo',
                                          lambda p: f"{p.get('qtd_sobras')} item(ns) com sobra"),
    'sobra_fechada': ('Sobra fechada', 'fluxo', lambda p: ''),
    'conferencia_concluida': ('Conferência concluída', 'fluxo',
                              lambda p: f"{p.get('volumes_count')} volume(s)" + ('' if p.get('senior_ok') else ' · WS Senior pendente')),
    'falta_registrada': ('Falta registrada', 'alerta', _faltas),
    'pedido_nao_conforme': ('Marcado não conforme', 'alerta', _nc),
    'nao_conforme_retomado': ('Conferência retomada', 'fluxo', _retomado),
    'nao_conforme_retornado': ('Voltou para a fila', 'fluxo',
                               lambda p: f"era {MOTIVOS_NC.get(p.get('motivo_anterior'), p.get('motivo_anterior') or '')}".strip()),
    # Devolver para Vendas (admin, 2026-11-16) — também usado pelo acerto manual de 16/11
    'conferido_retornado': ('Devolvido para Vendas', 'alerta',
                            lambda p: ' · '.join(x for x in (
                                f"era {p.get('status_anterior') or 'conferido'}",
                                f"{len(p.get('volumes_apagados') or [])} volume(s) apagado(s)",
                                p.get('motivo') or '',
                            ) if x)),
    # Embarque lido do Senior (E145EBQ/E145NFV, 2026-11-24) — apps/pedidos/embarque.py
    'embarcado': ('Embarcado', 'fluxo', _embarcado),
    'embarque_detectado': ('Nota já embarcada no Senior', 'alerta',
                           lambda p: _embarque(p) + ' · a situação não mudou: o documento está em '
                                     + str(STATUS.get(p.get('status'), p.get('status') or 'andamento'))),
    'embarque_alterado': ('Embarque alterado no Senior', 'fluxo', _embarque),
    'embarque_desfeito': ('Embarque desfeito no Senior', 'alerta', _embarque_desfeito),
    'selecao_retornada': ('Seleção desfeita', 'alerta', lambda p: f"era {p.get('status_anterior') or 'selecionado'}"),
    'cancelado': ('Cancelado', 'alerta', _cancelado),
    'conferencia_transferida': ('Conferência transferida', 'fluxo',
                                lambda p: f"para {p.get('destino_numero') or p.get('destino') or 'documento reemitido'}"),
    'conferencia_recebida': ('Conferência recebida', 'fluxo',
                             lambda p: f"de {p.get('origem_numero') or p.get('origem') or 'documento cancelado'}"),
    'etiqueta_impressa': ('Etiqueta de volume impressa', 'etiqueta', _etiqueta),
    'etiqueta_enfileirada': ('Etiqueta na fila do agente USB', 'etiqueta', _etiqueta),
    'etiqueta_erro': ('Falha ao imprimir etiqueta', 'alerta', lambda p: p.get('erro') or ''),
    'carta_correcao': ('Carta de correção', 'fluxo', _carta),
    'carta_correcao_transmissao': ('Carta de correção transmitida', 'fluxo', _carta),
    'carta_correcao_verificada': ('Carta de correção verificada no Senior', 'fluxo', _carta),
    'carta_correcao_reenvio': ('Carta de correção reenviada (completa)', 'fluxo', _carta),
    'carta_correcao_reimportada': ('Carta de correção reimportada no Senior', 'alerta',
                                   lambda p: ('simulada · ' if p.get('simulada') else '') + (f"erro: {p.get('erro')}" if p.get('erro') else f"protocolo {p.get('protocolo') or ''}")),
    # escopo congelado
    'separacao_finalizada': ('Separação finalizada (legado)', 'legado', lambda p: ''),
    'endereco_atribuido': ('Endereço atribuído (legado)', 'legado', lambda p: p.get('endereco') or ''),
    'embalagem_enviada': ('Embalagem enviada ao Senior (legado)', 'legado', lambda p: ''),
    'faturado_senior': ('Faturado no Senior (legado)', 'legado', lambda p: ''),
    'etiqueta_vtex_recebida': ('Etiqueta VTEX recebida (legado)', 'legado', lambda p: ''),
    'pedido_confirmado_lote': ('Confirmado no lote (legado)', 'legado', lambda p: ''),
}


def descrever(log: PedidoLog) -> dict:
    titulo, tipo, fn = ROTULOS.get(log.acao, (log.acao.replace('_', ' ').capitalize(), 'fluxo', lambda p: ''))
    payload = log.payload if isinstance(log.payload, dict) else {}
    try:
        descricao = fn(payload) or ''
    except Exception:
        descricao = ''
    return {
        'id': log.id,
        'criado_em': log.criado_em,
        'usuario': log.usuario.username if log.usuario else None,
        'acao': log.acao,
        'titulo': titulo,
        'descricao': descricao,
        'tipo': tipo,
        'payload': payload,
    }


def linha_do_tempo(pedido: Pedido) -> list[dict]:
    logs = pedido.logs.select_related('usuario').order_by('criado_em', 'id')
    return [descrever(l) for l in logs]
