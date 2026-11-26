'use client'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { impressaoApi, type BloqueioEtiqueta, type ImpressoraEtiqueta } from '@/lib/api'
import { useToast } from '@/components/Toast'

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
/** Texto curto do botão desabilitado, por código do bloqueio vindo do backend */
export function rotuloBloqueio(b: BloqueioEtiqueta | null | undefined): string {
  if (!b) return ''
  if (b.codigo === 'sem_transportadora') return 'Sem transportadora'
  if (b.codigo === 'sem_nf') return 'Sem NF'
  if (b.codigo === 'volumes_divergentes') return 'Volumes ≠ NF'
  if (b.codigo === 'em_cotacao') return 'EM COTAÇÃO'
  return 'Indisponível'
}

export function ImprimirEtiqueta({
  pedidoId, impressaEm, bloqueio, onImpresso, compacto = false,
}: {
  pedidoId: number
  impressaEm?: string | null
  /** Bloqueio vindo do backend (`etiqueta_bloqueio` / `bloqueio`) — desabilita o botão; a mensagem vai no title */
  bloqueio?: BloqueioEtiqueta | null
  onImpresso?: () => void
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [impressoras, setImpressoras] = useState<ImpressoraEtiqueta[] | null>(null)
  const [escolhida, setEscolhida] = useState<number | 'navegador'>('navegador')
  const [enviando, setEnviando] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  // Reimpressão só de alguns volumes (2026-11-19 — acabou o ribbon na 12ª de 30 etiquetas)
  const [soAlguns, setSoAlguns] = useState(false)
  const [volumes, setVolumes] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  // O seletor sai num portal com posição fixa (2026-11-16): dentro da linha ele era cortado
  // pelo `overflow-hidden` do card quando a lista tinha poucas linhas (busca por um pedido).
  const popRef = useRef<HTMLDivElement>(null)
  const [posicao, setPosicao] = useState<CSSProperties | null>(null)
  const toast = useToast()

  useLayoutEffect(() => {
    if (!aberto) { setPosicao(null); return }
    const LARGURA = 288  // w-72
    const ALTURA_MAX = 360
    const calcular = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const right = Math.max(8, window.innerWidth - r.right)
      const left = window.innerWidth - right - LARGURA < 8 ? 8 : undefined
      const abreParaCima = r.bottom + ALTURA_MAX > window.innerHeight && r.top > ALTURA_MAX
      setPosicao(
        abreParaCima
          ? { position: 'fixed', bottom: window.innerHeight - r.top + 4, right, left }
          : { position: 'fixed', top: r.bottom + 4, right, left },
      )
    }
    calcular()
    window.addEventListener('scroll', calcular, true)
    window.addEventListener('resize', calcular)
    return () => {
      window.removeEventListener('scroll', calcular, true)
      window.removeEventListener('resize', calcular)
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    setFeedback(null)
    setSoAlguns(false)
    setVolumes('')
    impressaoApi.impressoras()
      .then((d) => { setImpressoras(d.impressoras); setEscolhida(escolhaInicial(d.impressoras)) })
      .catch(() => setImpressoras([]))
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (ref.current?.contains(alvo) || popRef.current?.contains(alvo)) return
      setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  async function imprimir() {
    const sel = soAlguns ? volumes.trim() : ''
    if (soAlguns && !sel) {
      setFeedback({ ok: false, msg: 'Informe os volumes (ex.: 12-30) ou escolha "Todos".' })
      return
    }
    guardarUltimaImpressora(String(escolhida))
    if (escolhida === 'navegador') {
      window.open(`/etiquetas/${pedidoId}${sel ? `?volumes=${encodeURIComponent(sel)}` : ''}`, '_blank', 'noopener')
      setAberto(false)
      return
    }
    setEnviando(true)
    setFeedback(null)
    try {
      const r = await impressaoApi.imprimir(pedidoId, { impressora_id: escolhida, ...(sel ? { volumes: sel } : {}) })
      // A impressora fica longe de quem clica: toast dizendo que já foi, para não mandar
      // de novo (2026-11-09). Rede = já enviado à Zebra; USB = na fila do agente.
      const viaAgente = r.impressao.canal === 'agente'
      const quais = r.impressao.volumes_texto ? ` (volumes ${r.impressao.volumes_texto})` : ''
      toast.ok(viaAgente ? 'Etiquetas na fila do agente' : 'Etiquetas enviadas à impressora', {
        detalhe: `${r.impressao.qtd_etiquetas} etiqueta(s)${quais} → ${r.impressao.impressora}. Não precisa mandar de novo.`,
      })
      setAberto(false)
      onImpresso?.()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { erro?: string } } })?.response?.data
      setFeedback({ ok: false, msg: d?.erro ?? 'Falha ao imprimir' })
      toast.erro('Falha ao imprimir a etiqueta', { detalhe: d?.erro ?? 'Tente de novo ou use o navegador.' })
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
        title={bloqueio?.mensagem}
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium min-h-[40px] px-3 transition-colors disabled:cursor-not-allowed ${
          bloqueio?.codigo === 'volumes_divergentes'
            // Alerta (2026-11-17): volumes do Separa ≠ volumes da NF — alguém precisa agir
            // (Corrigir NF). Verde desabilitado passava despercebido.
            ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300'
            : bloqueio?.codigo === 'em_cotacao'
              // Em cotação de frete (2026-11-26): é uma situação da nota, não um defeito — azul-claro
              ? 'border-sky-400 bg-sky-50 text-sky-800 font-semibold tracking-wide dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-300'
            : bloqueio
              ? 'border-surface-border bg-surface-card text-ink-muted opacity-60'
              : impressaEm
                ? 'border-surface-border bg-surface-card text-ink-muted hover:bg-surface-elev hover:text-ink'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300'
        }`}
      >
        <IconeEtiqueta />
        {!compacto && (bloqueio ? rotuloBloqueio(bloqueio) : rotulo)}
      </button>
      {quando && !compacto && (
        <span className="text-[11px] text-ink-subtle mt-0.5 whitespace-nowrap">impressa {quando}</span>
      )}

      {aberto && posicao && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} style={posicao} className="z-50 w-72 bg-surface-card border border-surface-border rounded-xl shadow-xl dark:shadow-black/40 p-3 text-left">
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

          {/* Sempre visível (2026-11-23): impressão que deu erro no meio não fica marcada como
              impressa, e ainda assim é preciso mandar só os volumes que faltaram */}
          {(
            <div className="mt-3 border-t border-surface-border pt-3">
              <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">Volumes</p>
              <div className="flex gap-1">
                <label className="flex-1 flex items-center gap-2 px-2 rounded-lg hover:bg-surface-elev cursor-pointer min-h-[40px] text-sm text-ink">
                  <input type="radio" name={`vol-${pedidoId}`} checked={!soAlguns} onChange={() => setSoAlguns(false)} />
                  Todos
                </label>
                <label className="flex-1 flex items-center gap-2 px-2 rounded-lg hover:bg-surface-elev cursor-pointer min-h-[40px] text-sm text-ink">
                  <input type="radio" name={`vol-${pedidoId}`} checked={soAlguns} onChange={() => setSoAlguns(true)} />
                  Só alguns
                </label>
              </div>
              {soAlguns && (
                <>
                  <input
                    autoFocus
                    value={volumes}
                    onChange={(e) => setVolumes(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') imprimir() }}
                    placeholder="ex.: 12-30 ou 3, 7, 10"
                    inputMode="numeric"
                    className="mt-1 w-full rounded-lg border border-surface-border bg-surface-bg px-3 min-h-[40px] text-sm text-ink"
                  />
                  <p className="mt-1 text-[11px] text-ink-subtle">Número do volume na etiqueta (VOLUME N/M). Intervalo com traço, vários com vírgula.</p>
                </>
              )}
            </div>
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
        </div>,
        document.body,
      )}
    </div>
  )
}
