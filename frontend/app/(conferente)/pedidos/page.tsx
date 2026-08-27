'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePedidosStore } from '@/stores/pedidosStore'
import { PedidoCard } from '@/components/pedidos/PedidoCard'
import { FilterBar } from '@/components/pedidos/FilterBar'

export default function PedidosPage() {
  const router = useRouter()
  const { pedidos, filtroStatus, loading, lastSync, setFiltro, fetchPedidos } = usePedidosStore()

  useEffect(() => {
    fetchPedidos()
    const interval = setInterval(fetchPedidos, 30_000)
    return () => clearInterval(interval)
  }, [])

  const syncLabel = lastSync
    ? lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
      {/* Cabeçalho */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold">Pedidos</h1>
          <div className="flex items-center gap-2">
            {syncLabel && (
              <span className="text-xs text-gray-400">sync {syncLabel}</span>
            )}
            <button
              onClick={fetchPedidos}
              disabled={loading}
              className="min-h-[36px] px-3 text-sm bg-gray-100 rounded-lg text-gray-600 disabled:opacity-40"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-400">
          {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filtros */}
      <FilterBar current={filtroStatus} onChange={setFiltro} />

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-2">
        {loading && pedidos.length === 0 && (
          <div className="text-center py-20 text-gray-400">Carregando…</div>
        )}
        {!loading && pedidos.length === 0 && (
          <div className="text-center py-20 text-gray-400">Nenhum pedido encontrado.</div>
        )}
        {pedidos.map((p) => (
          <PedidoCard
            key={p.id}
            pedido={p}
            onClick={() => router.push(`/pedidos/${p.id}`)}
          />
        ))}
      </div>
    </div>
  )
}
