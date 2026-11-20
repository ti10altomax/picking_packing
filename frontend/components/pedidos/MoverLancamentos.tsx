'use client'
import { useMemo, useState } from 'react'
import { supervisorApi, type BloqueioEtiqueta } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { tituloVolume, type ItemDoc, type VolumeDoc } from '@/components/pedidos/ItensPorVolume'

/**
 * Mover lançamentos entre volumes depois da conferência (2026-11-19).
 *
 * O conferente esqueceu de abrir um volume novo e concluiu com tudo numa caixa só; antes a
 * única saída era "Devolver para Vendas" e conferir tudo de novo. Sup. Pátio/admin marca os
 * lançamentos (inteiros — não divide quantidade) e manda para um volume existente ou para um
 * volume novo. Volume de OP (lacrado da fábrica) não entra. Volume de origem que ficar vazio
 * some. A etiqueta já impressa fica velha: a tela avisa para reimprimir.
 */
export type ResultadoMover = {
  volumes?: VolumeDoc[]
  etiqueta_bloqueio?: BloqueioEtiqueta | null
  etiqueta_impressa?: boolean
  movidos: number
  destino_id: number
}

type CorpoMover = {
  volume_item_ids: number[]
  destino: { volume_id: number } | { novo: { tipo: 'caixa' | 'fardo' | 'outro'; identificador?: string } }
}

const TIPOS: { valor: 'caixa' | 'fardo' | 'outro'; label: string }[] = [
  { valor: 'caixa', label: 'Caixa' },
  { valor: 'fardo', label: 'Fardo' },
  { valor: 'outro', label: 'Outro' },
]

export function MoverLancamentos({
  pedidoId, numero, itens, volumes, onFechar, onMovido, mover: moverFn, sugerirIdentificador,
}: {
  pedidoId: number
  numero: string
  itens: ItemDoc[]
  volumes: VolumeDoc[]
  onFechar: () => void
  onMovido: (r: ResultadoMover) => void
  /** Endpoint usado; padrão = mover do Pátio em Conferidos/Fechamentos. A conferência passa o dela. */
  mover?: (pedidoId: number, body: CorpoMover) => Promise<ResultadoMover>
  /** Nome sugerido para o volume novo ("Caixa 3"), como no + Volume da conferência */
  sugerirIdentificador?: (tipo: 'caixa' | 'fardo' | 'outro') => string
}) {
  const toast = useToast()
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [destino, setDestino] = useState<number | 'novo'>('novo')
  const [tipoNovo, setTipoNovo] = useState<'caixa' | 'fardo' | 'outro'>('caixa')
  const [identificador, setIdentificador] = useState(() => sugerirIdentificador?.('caixa') ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const itemMap = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens])
  const moviveis = volumes.filter((v) => !v.op)
  const volumesOrigemMarcados = new Set(
    volumes.filter((v) => v.itens.some((vi) => marcados.has(vi.id))).map((v) => v.id),
  )
  // destino igual à única origem não faz sentido
  const destinoInvalido = destino !== 'novo' && volumesOrigemMarcados.size === 1 && volumesOrigemMarcados.has(destino)

  function alternar(id: number) {
    setMarcados((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function alternarVolume(v: VolumeDoc) {
    const ids = v.itens.map((vi) => vi.id)
    const todos = ids.every((id) => marcados.has(id))
    setMarcados((prev) => {
      const n = new Set(prev)
      ids.forEach((id) => (todos ? n.delete(id) : n.add(id)))
      return n
    })
  }

  async function mover() {
    if (marcados.size === 0 || destinoInvalido) return
    setEnviando(true)
    setErro('')
    try {
      const r = await (moverFn ?? supervisorApi.moverLancamentos)(pedidoId, {
        volume_item_ids: Array.from(marcados),
        destino: destino === 'novo'
          ? { novo: { tipo: tipoNovo, identificador: identificador.trim() } }
          : { volume_id: destino },
      })
      toast.ok(`${r.movidos} lançamento(s) movido(s)`, {
        detalhe: r.etiqueta_impressa
          ? 'A etiqueta impressa ficou velha — reimprima pelo botão Etiqueta.'
          : r.etiqueta_bloqueio?.codigo === 'volumes_divergentes'
            ? 'Volumes agora diferem da NF — a etiqueta espera a carta de correção.'
            : undefined,
        duracao: 6000,
      })
      onMovido(r)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Não foi possível mover.')
    } finally {
      setEnviando(false)
    }
  }

  const INPUT = 'bg-surface-elev border border-surface-border text-ink rounded-lg px-3 text-sm min-h-[44px]'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onFechar}>
      <div
        className="bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-surface-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink">Mover itens entre volumes</h2>
            <p className="text-sm text-ink-muted">
              {numero} · marque os lançamentos e escolha para onde vão. O lançamento vai inteiro.
            </p>
          </div>
          <button onClick={onFechar} className="text-ink-subtle hover:text-ink min-h-[40px] px-2 text-xl" aria-label="Fechar">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {moviveis.length === 0 && (
            <p className="text-sm text-ink-subtle italic">Só há caixas/fardos da fábrica (OP) neste documento — eles não podem ser reorganizados.</p>
          )}
          {volumes.map((v, idx) => {
            const ids = v.itens.map((vi) => vi.id)
            const todos = ids.length > 0 && ids.every((id) => marcados.has(id))
            return (
              <section key={v.id} className={`rounded-lg border overflow-hidden ${v.op ? 'border-surface-border opacity-60' : 'border-emerald-200 dark:border-emerald-500/30'}`}>
                <header className="flex items-center gap-2 px-3 py-2 bg-surface-elev/60 border-b border-surface-border">
                  {!v.op && ids.length > 0 && (
                    <input type="checkbox" checked={todos} onChange={() => alternarVolume(v)} className="w-5 h-5 accent-emerald-600" title="Marcar todos deste volume" />
                  )}
                  <span className="text-sm font-semibold text-ink">{tituloVolume(v, idx)}</span>
                  {v.op && <span className="text-[10px] uppercase tracking-wide bg-zinc-500 text-white px-1.5 py-0.5 rounded">fábrica · não move</span>}
                  <span className="ml-auto text-xs text-ink-muted">{v.itens.length} {v.itens.length === 1 ? 'lançamento' : 'lançamentos'}</span>
                </header>
                {v.itens.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-ink-subtle italic">Volume vazio.</p>
                ) : (
                  <ul className="divide-y divide-surface-border/60">
                    {v.itens.map((vi) => {
                      const item = itemMap.get(vi.pedido_item_id)
                      const marcado = marcados.has(vi.id)
                      return (
                        <li key={vi.id}>
                          <label className={`flex items-center gap-3 px-3 py-2 min-h-[44px] ${v.op ? '' : 'cursor-pointer hover:bg-surface-elev/50'} ${marcado ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''}`}>
                            <input type="checkbox" disabled={!!v.op} checked={marcado} onChange={() => alternar(vi.id)} className="w-5 h-5 accent-emerald-600" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-mono text-ink truncate">{item ? item.sku : `item #${vi.pedido_item_id}`}</span>
                              {item?.descricao && <span className="block text-xs text-ink-subtle truncate">{item.descricao}</span>}
                            </span>
                            <span className="text-sm font-bold text-ink shrink-0">{vi.qtd}×</span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-surface-border space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted">Mover para:</span>
            <select value={destino === 'novo' ? 'novo' : String(destino)} onChange={(e) => setDestino(e.target.value === 'novo' ? 'novo' : Number(e.target.value))} className={`${INPUT} flex-1 min-w-[160px]`}>
              <option value="novo">Novo volume</option>
              {moviveis.map((v, i) => (
                <option key={v.id} value={v.id}>{tituloVolume(v, volumes.indexOf(v) >= 0 ? volumes.indexOf(v) : i)}</option>
              ))}
            </select>
            {destino === 'novo' && (
              <>
                <select
                  value={tipoNovo}
                  onChange={(e) => {
                    const t = e.target.value as 'caixa' | 'fardo' | 'outro'
                    setTipoNovo(t)
                    if (sugerirIdentificador) setIdentificador(sugerirIdentificador(t))
                  }}
                  className={INPUT}
                >
                  {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                </select>
                <input value={identificador} onChange={(e) => setIdentificador(e.target.value)} maxLength={100} placeholder="Identificador (opcional)" className={`${INPUT} w-44`} />
              </>
            )}
          </div>
          {destinoInvalido && <p className="text-xs text-amber-600 dark:text-amber-400">Os lançamentos marcados já estão nesse volume.</p>}
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-subtle">{marcados.size} marcado(s)</span>
            <div className="flex gap-2">
              <button onClick={onFechar} className="min-h-[44px] px-4 rounded-lg border border-surface-border text-sm text-ink-muted hover:bg-surface-elev">Cancelar</button>
              <button
                onClick={mover}
                disabled={enviando || marcados.size === 0 || destinoInvalido}
                className="min-h-[44px] px-5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {enviando ? 'Movendo…' : `Mover ${marcados.size > 0 ? marcados.size : ''}`.trim()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
