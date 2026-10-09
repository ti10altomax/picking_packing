'use client'
import { useEffect, useState } from 'react'
import { historicoApi, type EventoHistorico, type HistoricoPedido as Historico } from '@/lib/api'

/**
 * Linha do tempo do documento (observabilidade, 2026-10-08).
 *
 * `HistoricoBotao` abre um modal com o `PedidoLog` traduzido pelo backend
 * (`/api/pedidos/<id>/historico/`). Bips consecutivos ficam agrupados para
 * a lista não virar uma parede; clique no grupo para abrir.
 */

const COR: Record<EventoHistorico['tipo'], string> = {
  fluxo: 'bg-blue-500',
  bip: 'bg-emerald-500',
  alerta: 'bg-red-500',
  etiqueta: 'bg-violet-500',
  legado: 'bg-ink-subtle',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

type Grupo = { chave: string; eventos: EventoHistorico[] }

function agrupar(eventos: EventoHistorico[]): Grupo[] {
  const grupos: Grupo[] = []
  for (const e of eventos) {
    const ultimo = grupos[grupos.length - 1]
    if (e.tipo === 'bip' && ultimo && ultimo.eventos[0].tipo === 'bip') ultimo.eventos.push(e)
    else grupos.push({ chave: String(e.id), eventos: [e] })
  }
  return grupos
}

function Evento({ e }: { e: EventoHistorico }) {
  return (
    <li className="relative pl-6 py-1.5">
      <span className={`absolute left-0 top-2.5 w-2.5 h-2.5 rounded-full ${COR[e.tipo]}`} />
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs text-ink-subtle tabular-nums">{fmt(e.criado_em)}</span>
        <span className={`text-sm font-medium ${e.tipo === 'alerta' ? 'text-red-700 dark:text-red-300' : 'text-ink'}`}>{e.titulo}</span>
        {e.usuario && <span className="text-xs text-ink-muted">{e.usuario}</span>}
      </div>
      {e.descricao && <p className="text-sm text-ink-muted mt-0.5 break-words">{e.descricao}</p>}
    </li>
  )
}

export function HistoricoModal({ pedidoId, onClose }: { pedidoId: number; onClose: () => void }) {
  const [dados, setDados] = useState<Historico | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  useEffect(() => {
    historicoApi.pedido(pedidoId).then(setDados).catch(() => setErro('Não foi possível carregar o histórico.'))
  }, [pedidoId])

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const grupos = dados ? agrupar(dados.eventos) : []

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-surface-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Histórico</p>
            {dados ? (
              <>
                <h2 className="text-lg font-semibold text-ink leading-tight">
                  {dados.pedido.tipo === 'nota_fiscal' ? 'NF' : 'Pedido'} {dados.pedido.numero_externo}
                  <span className="ml-2 text-xs font-medium bg-surface-elev text-ink-muted px-2 py-0.5 rounded-full align-middle">{dados.pedido.status_label}</span>
                </h2>
                <p className="text-sm text-ink-muted truncate">
                  {dados.pedido.cliente || '—'}
                  {dados.pedido.sequencia && <> · sequência {dados.pedido.sequencia}</>}
                  {dados.pedido.conferente && <> · {dados.pedido.conferente}</>}
                </p>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-ink">Carregando…</h2>
            )}
          </div>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink min-h-[44px] min-w-[44px] text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          {dados && dados.eventos.length === 0 && <p className="text-sm text-ink-subtle">Nenhum evento registrado.</p>}
          {dados && (
            <ul className="relative border-l border-surface-border ml-1 pl-1">
              {grupos.map((g) => {
                if (g.eventos.length === 1) return <Evento key={g.chave} e={g.eventos[0]} />
                const aberto = abertos.has(g.chave)
                const total = g.eventos.reduce((s, e) => s + (Number((e.payload as { qtd?: number }).qtd) || 0), 0)
                return (
                  <li key={g.chave} className="relative pl-6 py-1.5">
                    <span className={`absolute left-0 top-2.5 w-2.5 h-2.5 rounded-full ${COR.bip}`} />
                    <button
                      onClick={() => setAbertos((prev) => { const n = new Set(prev); if (n.has(g.chave)) n.delete(g.chave); else n.add(g.chave); return n })}
                      className="text-left min-h-[32px]"
                    >
                      <span className="text-xs text-ink-subtle tabular-nums">{fmt(g.eventos[0].criado_em)} → {fmt(g.eventos[g.eventos.length - 1].criado_em).slice(-8)}</span>
                      <span className="ml-2 text-sm font-medium text-ink">{g.eventos.length} bips</span>
                      <span className="ml-2 text-sm text-ink-muted">{total} unidades · {aberto ? 'ocultar' : 'ver cada um'}</span>
                    </button>
                    {aberto && (
                      <ul className="mt-1 border-l border-surface-border ml-1 pl-1">
                        {g.eventos.map((e) => <Evento key={e.id} e={e} />)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Botão discreto "Histórico" para usar nas linhas das listas do supervisor. */
export function HistoricoBotao({ pedidoId, className = '' }: { pedidoId: number; className?: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberto(true) }}
        title="Histórico do documento"
        className={`inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink border border-surface-border rounded-lg px-2 min-h-[32px] hover:bg-surface-elev transition-colors ${className}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />
        </svg>
        Histórico
      </button>
      {aberto && <HistoricoModal pedidoId={pedidoId} onClose={() => setAberto(false)} />}
    </>
  )
}
