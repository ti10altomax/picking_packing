import { Pedido } from '@/stores/pedidosStore'
import { StatusBadge, statusBorderClass } from '@/components/ui/StatusBadge'

interface Props {
  pedido: Pedido
  onClick: () => void
}

export function PedidoCard({ pedido, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${statusBorderClass(pedido.status)} p-4 active:scale-[0.98] transition-transform`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight"># {pedido.numero_externo}</p>
          <p className="text-sm text-gray-500 truncate mt-0.5">{pedido.cliente || '—'}</p>
        </div>
        <StatusBadge status={pedido.status} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {pedido.marketplace_nome && (
          <span className="bg-gray-100 rounded px-1.5 py-0.5 text-xs text-gray-600">
            {pedido.marketplace_nome}
          </span>
        )}
        {pedido.qtd_itens > 0 && (
          <span className="text-xs text-gray-400">
            {pedido.qtd_itens} {pedido.qtd_itens === 1 ? 'item' : 'itens'}
          </span>
        )}
        {pedido.percent_separado > 0 && pedido.percent_separado < 100 && (
          <span className="text-xs text-blue-500">{pedido.percent_separado}% sep.</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">{pedido.tempo_espera}</span>
      </div>
    </button>
  )
}
