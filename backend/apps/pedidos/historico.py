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


def _etiqueta(p):
    txt = f"{p.get('qtd_etiquetas') or '?'} etiqueta(s) · {p.get('impressora') or p.get('canal') or ''}"
    if p.get('automatica'):
        txt += ' · automática'
    return txt


def _nc(p):
    txt = MOTIVOS_NC.get(p.get('motivo'), p.get('motivo') or '')
    if p.get('detalhe'):
        txt += f" — {p.get('detalhe')}"
    return txt


# acao → (título, tipo, descrição(payload))
ROTULOS = {
    'pedido_selecionado': ('Selecionado para separação', 'fluxo', lambda p: ''),
    'pedido_sequenciado': ('Entrou na sequência', 'fluxo', lambda p: f"sequência {p.get('numero')}"),
    'pedido_removido_sequencia': ('Removido da sequência', 'fluxo', lambda p: f"sequência {p.get('numero')}"),
    'pedido_atribuido': ('Atribuído ao conferente', 'fluxo', _atribuido),
    'conferencia_iniciada': ('Conferência iniciada', 'fluxo',
                             lambda p: f"separado por {p.get('separado_por')}" if p.get('separado_por') else 'separador não identificado'),
    'separado_por_alterado': ('Separador alterado', 'fluxo', lambda p: p.get('separado_por') or ''),
    'volume_criado': ('Volume aberto', 'fluxo', _vol),
    'volume_removido': ('Volume removido', 'alerta', _vol),
    'item_bipado': ('Item bipado', 'bip',
                    lambda p: f"{p.get('sku')} × {p.get('qtd')} · total {p.get('qtd_separada_total')}"),
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
    'nao_conforme_retornado': ('Voltou para a fila', 'fluxo',
                               lambda p: f"era {MOTIVOS_NC.get(p.get('motivo_anterior'), p.get('motivo_anterior') or '')}".strip()),
    'cancelado': ('Cancelado', 'alerta', _cancelado),
    'conferencia_transferida': ('Conferência transferida', 'fluxo',
                                lambda p: f"para {p.get('destino_numero') or p.get('destino') or 'documento reemitido'}"),
    'conferencia_recebida': ('Conferência recebida', 'fluxo',
                             lambda p: f"de {p.get('origem_numero') or p.get('origem') or 'documento cancelado'}"),
    'etiqueta_impressa': ('Etiqueta de volume impressa', 'etiqueta', _etiqueta),
    'etiqueta_erro': ('Falha ao imprimir etiqueta', 'alerta', lambda p: p.get('erro') or ''),
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
