'use client'
import { useEffect, useRef, useState } from 'react'
import { impressaoApi, type ImpressoraEtiqueta } from '@/lib/api'

// Última impressora escolhida neste aparelho — conveniência local, nada de servidor
const CHAVE_ULTIMA = 'etiqueta_impressora'

export function lerUltimaImpressora(): string | null {
  try { return localStorage.getItem(CHAVE_ULTIMA) } catch { return null }
}

export function guardarUltimaImpressora(valor: string) {
  try { localStorage.setItem(CHAVE_ULTIMA, valor) } catch { /* privado / bloqueado */ }
}

/** Escolhe a impressora inicial: a última usada aqui, senão a padrão, senão o navegador. */
export function escolhaInicial(lista: ImpressoraEtiqueta[]): number | 'navegador' {
  const salva = lerUltimaImpressora()
  if (salva === 'navegador') return 'navegador'
  if (salva && lista.some((i) => String(i.id) === salva)) return Number(salva)
  const padrao = lista.find((i) => i.padrao)
  if (padrao) return padrao.id
  return lista[0]?.id ?? 'navegador'
}

export function IconeEtiqueta({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <path d="M7 7h.01" />
    </svg>
  )
}

/**
 * Botão "Etiqueta / Reimprimir" com o seletor de destino (Zebra de rede, agente
 * USB ou navegador). Usado na lista de Conferidos e em Etiquetas pendentes.
 */
export function ImprimirEtiqueta({
  pedidoId, impressaEm, bloqueio, onImpresso, compacto = false,
}: {
  pedidoId: number
  impressaEm?: string | null
  /** Mensagem de bloqueio (ex.: sem transportadora) — desabilita o botão */
  bloqueio?: string | null
  onImpresso?: () => void
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [impressoras, setImpressoras] = useState<ImpressoraEtiqueta[] | null>(null)
  const [escolhida, setEscolhida] = useState<number | 'navegador'>('navegador')
  const [enviando, setEnviando] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    setFeedback(null)
    impressaoApi.impressoras()
      .then((d) => { setImpressoras(d.impressoras); setEscolhida(escolhaInicial(d.impressoras)) })
      .catch(() => setImpressoras([]))
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function imprimir() {
    guardarUltimaImpressora(String(escolhida))
    if (escolhida === 'navegador') {
      window.open(`/etiquetas/${pedidoId}`, '_blank', 'noopener')
      setAberto(false)
      return
    }
    setEnviando(true)
    setFeedback(null)
    try {
      const r = await impressaoApi.imprimir(pedidoId, { impressora_id: escolhida })
      setFeedback({ ok: true, msg: `${r.impressao.qtd_etiquetas} etiqueta(s) → ${r.impressao.impressora}` })
      onImpresso?.()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { erro?: string } } })?.response?.data
      setFeedback({ ok: false, msg: d?.erro ?? 'Falha ao imprimir' })
    } finally {
      setEnviando(false)
    }
  }

  const rotulo = impressaEm ? 'Reimprimir' : 'Etiqueta'
  const quando = impressaEm
    ? new Date(impressaEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div ref={ref} className="relative inline-flex flex-col items-end">
      <button
        type="button"
        disabled={!!bloqueio}
        title={bloqueio ?? undefined}
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium min-h-[40px] px-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          impressaEm
            ? 'border-surface-border bg-surface-card text-ink-muted hover:bg-surface-elev hover:text-ink'
            : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
        }`}
      >
        <IconeEtiqueta />
        {!compacto && (bloqueio ? 'Sem transportadora' : rotulo)}
      </button>
      {quando && !compacto && (
        <span className="text-[11px] text-ink-subtle mt-0.5 whitespace-nowrap">impressa {quando}</span>
      )}

      {aberto && (
        <div className="absolute right-0 top-full mt-1 z-30 w-72 bg-surface-card border border-surface-border rounded-xl shadow-xl dark:shadow-black/40 p-3 text-left">
          <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-2">Imprimir em</p>
          {impressoras === null ? (
            <p className="text-sm text-ink-muted">Carregando…</p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {impressoras.map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-elev cursor-pointer min-h-[40px]">
                    <input type="radio" name={`imp-${pedidoId}`} checked={escolhida === i.id} onChange={() => setEscolhida(i.id)} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">
                        {i.nome}{i.padrao && <span className="ml-1 text-[10px] uppercase text-emerald-600 dark:text-emerald-400">padrão</span>}
                      </span>
                      <span className="block text-[11px] text-ink-subtle truncate">
                        {i.tipo_conexao === 'rede' ? `rede ${i.ip ?? ''}` : 'USB via agente'}{i.mesa ? ` · ${i.mesa}` : ''}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              <li>
                <label className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-surface-elev cursor-pointer min-h-[40px]">
                  <input type="radio" name={`imp-${pedidoId}`} checked={escolhida === 'navegador'} onChange={() => setEscolhida('navegador')} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink">Navegador</span>
                    <span className="block text-[11px] text-ink-subtle">qualquer impressora · abre a página 10x15</span>
                  </span>
                </label>
              </li>
            </ul>
          )}

          <button
            type="button"
            onClick={imprimir}
            disabled={enviando || impressoras === null}
            className="mt-3 w-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-lg min-h-[44px] text-sm font-semibold disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : escolhida === 'navegador' ? 'Abrir etiqueta' : 'Imprimir'}
          </button>

          {feedback && (
            <p className={`mt-2 text-xs ${feedback.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {feedback.msg}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
