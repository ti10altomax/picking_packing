'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { separacaoApi } from '@/lib/api'

type PedidoLista = {
  id: number
  numero_externo: string
  cliente: string
  status: 'atribuido' | 'separando'
  qtd_itens: number
  percent_separado: number
  atribuido_em: string | null
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

export default function SeparacaoListaPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<PedidoLista[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await separacaoApi.listarAtribuidos()
      setPedidos(data)
      setLastSync(new Date())
    } finally {
      setLoading(false)
    }
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
          <h1 className="text-xl font-bold text-ink">Atribuídos a mim</h1>
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
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading && pedidos.length === 0 && (
          <p className="text-center py-20 text-ink-subtle">Carregando…</p>
        )}
        {!loading && pedidos.length === 0 && (
          <p className="text-center py-20 text-ink-subtle">Nenhum pedido atribuído.</p>
        )}
        {pedidos.map((p) => (
          <button
            key={p.id}
            onClick={() => router.push(`/separacao/${p.id}`)}
            className="w-full bg-surface-card border border-surface-border rounded-xl p-4 text-left hover:border-blue-400 dark:hover:border-blue-500/60 hover:shadow-md dark:hover:shadow-blue-500/10 active:scale-[0.99] transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink">{p.numero_externo}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.status === 'separando'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    }`}
                  >
                    {p.status === 'separando' ? 'Em separação' : 'Atribuído'}
                  </span>
                </div>
                <p className="text-sm text-ink-muted truncate mt-0.5">
                  {p.cliente || '—'}
                </p>
                <p className="text-xs text-ink-subtle mt-1">
                  {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'} · {tempoDesde(p.atribuido_em)}
                </p>
              </div>
              {p.status === 'separando' && (
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{p.percent_separado}%</p>
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
