'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { conferenciaApi } from '@/lib/api'

type PedidoLista = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  status: 'atribuido' | 'conferindo'
  qtd_itens: number
  percent_conferido: number
  atribuido_em: string | null
  sequencia: { id: number; numero: number } | null
  transportadora?: string
}

type ListaResposta = {
  sequencia: { id: number; numero: number } | null
  aguardando_sequencia: { id: number; numero: number } | null
  pedidos: PedidoLista[]
  outras_sequencias_pendentes: number
  sequencia_disponivel: { id: number; numero: number } | null
  disponiveis: PedidoLista[]
}

// Ponto 4 da diretoria (leitura B): quando o código bipado bate com mais de um documento
type Opcao = {
  id: number; tipo: string; numero_externo: string; codsnf: string; cliente: string
  status: string; status_label: string; conferente: string | null
  sequencia: { id: number; numero: number } | null
}

function tempoDesde(iso: string | null): string {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

export default function ConferenciaListaPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<PedidoLista[]>([])
  const [sequencia, setSequencia] = useState<{ id: number; numero: number } | null>(null)
  const [aguardando, setAguardando] = useState<{ id: number; numero: number } | null>(null)
  const [outras, setOutras] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [seqDisponivel, setSeqDisponivel] = useState<{ id: number; numero: number } | null>(null)
  const [disponiveis, setDisponiveis] = useState<PedidoLista[]>([])

  // Barra de bipagem da nota — mesma barra da tela do pedido: recebe o leitor do coletor
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [scanFlash, setScanFlash] = useState<'erro' | null>(null)
  const [pegando, setPegando] = useState(false)
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const data: ListaResposta = await conferenciaApi.listarAtribuidos()
      setPedidos(data.pedidos)
      setSequencia(data.sequencia)
      setAguardando(data.aguardando_sequencia)
      setOutras(data.outras_sequencias_pendentes)
      setSeqDisponivel(data.sequencia_disponivel ?? null)
      setDisponiveis(data.disponiveis ?? [])
      setLastSync(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  function erroScan(msg: string) {
    setScanFlash('erro')
    setScanMsg(msg)
    setScanValue('')
    setTimeout(() => { setScanFlash(null); setScanMsg('') }, 3000)
  }

  const pegar = useCallback(async (body: { codigo?: string; pedido_id?: number }) => {
    if (pegando) return
    setPegando(true)
    try {
      const res = await conferenciaApi.pegarDocumento(body)
      setOpcoes(null)
      setScanValue('')
      router.push(`/conferencia/${res.pedido.id}`)
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { resultado?: string; erro?: string; opcoes?: Opcao[] } } })?.response?.data
      if (data?.resultado === 'ambiguo' && data.opcoes) {
        setOpcoes(data.opcoes)
        setScanValue('')
      } else {
        erroScan(data?.erro || 'Erro ao buscar o documento')
      }
    } finally {
      setPegando(false)
    }
  }, [pegando, router])

  function handleScan() {
    const cod = scanValue.trim()
    if (!cod) return
    pegar({ codigo: cod })
  }

  useEffect(() => {
    scanRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 30_000)
    return () => clearInterval(t)
  }, [carregar])

  const syncLabel = lastSync
    ? lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">Atribuídos a mim</h1>
            {sequencia && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                Sequência {sequencia.numero}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncLabel && <span className="text-xs text-ink-subtle">sync {syncLabel}</span>}
            <button
              onClick={carregar}
              disabled={loading}
              className="min-h-[36px] px-3 text-sm bg-surface-elev hover:bg-surface-border rounded-lg text-ink-muted disabled:opacity-40 transition-colors"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>
        </div>
        <p className="text-sm text-ink-subtle">
          {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
          {outras > 0 && ` · +${outras} em próximas sequências`}
        </p>
      </div>

      {/* Bipar a nota para pegar (ou abrir) o pedido — ponto 4 da diretoria */}
      <div className="px-4 pb-3">
        <div
          className={`flex items-center gap-2 rounded-xl border-2 px-3 h-14 transition-all ${
            scanFlash === 'erro'
              ? 'border-red-500 bg-red-50 dark:bg-red-500/10'
              : 'border-zinc-900 bg-zinc-900 shadow-[0_0_24px_rgb(0_0_0/0.15)] dark:border-zinc-700 dark:shadow-[0_0_24px_rgb(59_130_246/0.15)]'
          }`}
        >
          <span className={`text-lg shrink-0 ${scanFlash === 'erro' ? 'text-red-500' : 'text-zinc-400'}`}>⌥</span>
          <input
            ref={scanRef}
            type="text"
            inputMode="none"
            placeholder={scanMsg || 'Bipe a nota para pegar…'}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan() }}
            onBlur={() => setTimeout(() => { if (!opcoes) scanRef.current?.focus({ preventScroll: true }) }, 80)}
            className={`flex-1 min-w-0 outline-none bg-transparent text-base font-mono tracking-wider ${
              scanFlash === 'erro'
                ? 'text-red-700 dark:text-red-400 placeholder-red-500'
                : 'text-white placeholder-zinc-500 caret-white'
            }`}
          />
        </div>
      </div>

      {opcoes && (
        <div className="mx-4 mb-3 bg-surface-card border border-amber-400 dark:border-amber-500/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-ink">Mais de um documento com esse número — qual é?</p>
            <button onClick={() => { setOpcoes(null); scanRef.current?.focus() }} className="text-sm text-ink-muted min-h-[36px] px-2">Cancelar</button>
          </div>
          <div className="space-y-2">
            {opcoes.map((o) => (
              <button
                key={o.id}
                onClick={() => pegar({ pedido_id: o.id })}
                className="w-full text-left bg-surface-elev border border-surface-border rounded-lg px-3 py-2 min-h-[44px] hover:border-blue-400"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">{o.numero_externo}</span>
                  <DocBadges tipo={o.tipo} />
                  {o.codsnf && <span className="text-xs text-ink-subtle">série {o.codsnf}</span>}
                  <span className="text-xs text-ink-muted">{o.status_label}{o.conferente ? ` · ${o.conferente}` : ''}{o.sequencia ? ` · seq. ${o.sequencia.numero}` : ''}</span>
                </div>
                <p className="text-sm text-ink-muted truncate">{o.cliente || '—'}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading && pedidos.length === 0 && (
          <p className="text-center py-20 text-ink-subtle">Carregando…</p>
        )}
        {!loading && pedidos.length === 0 && aguardando && (
          <div className="text-center py-20 px-6">
            <p className="text-ink font-semibold mb-1">Você terminou os seus pedidos 🎉</p>
            <p className="text-sm text-ink-subtle">
              Aguardando a conclusão da <strong>sequência {aguardando.numero}</strong> para liberar a próxima.
            </p>
          </div>
        )}
        {!loading && pedidos.length === 0 && !aguardando && disponiveis.length === 0 && (
          <p className="text-center py-20 text-ink-subtle">Nenhum pedido atribuído.</p>
        )}
        {pedidos.map((p) => (
          <button
            key={p.id}
            onClick={() => router.push(`/conferencia/${p.id}`)}
            className="w-full bg-surface-card border border-surface-border rounded-xl p-4 text-left hover:border-blue-400 dark:hover:border-blue-500/60 hover:shadow-md dark:hover:shadow-blue-500/10 active:scale-[0.99] transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink">{p.numero_externo}</span>
                  <DocBadges tipo={p.tipo} frete={p.frete} />
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'conferindo'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    }`}
                  >
                    {p.status === 'conferindo' ? 'Em conferência' : 'Atribuído'}
                  </span>
                </div>
                <p className="text-sm text-ink-muted truncate mt-0.5">
                  {p.cliente || '—'}
                </p>
                <p className="text-xs text-ink-subtle mt-1">
                  {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'} · {tempoDesde(p.atribuido_em)}
                </p>
              </div>
              {p.status === 'conferindo' && (
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{p.percent_conferido}%</p>
                </div>
              )}
            </div>
          </button>
        ))}

        {/* Disponíveis para pegar (sequência mais antiga liberada pela trava) */}
        {seqDisponivel && disponiveis.length > 0 && (
          <div className="pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">
              Disponíveis na sequência {seqDisponivel.numero} · {disponiveis.length} · bipe a nota ou toque para pegar
            </p>
            <div className="space-y-2">
              {disponiveis.map((p) => (
                <button
                  key={`d-${p.id}`}
                  onClick={() => pegar({ pedido_id: p.id })}
                  disabled={pegando}
                  className="w-full bg-surface-card border border-dashed border-surface-border rounded-xl p-3 text-left hover:border-amber-400 dark:hover:border-amber-500/60 disabled:opacity-50 transition-all"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{p.numero_externo}</span>
                    <DocBadges tipo={p.tipo} frete={p.frete} />
                    <span className="text-xs text-ink-subtle">{p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}</span>
                  </div>
                  <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                  {p.transportadora && <p className="text-xs text-ink-subtle truncate">{p.transportadora}</p>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
