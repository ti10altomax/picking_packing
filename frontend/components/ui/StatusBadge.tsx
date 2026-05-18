const STATUS_CONFIG: Record<string, { label: string; badge: string; border: string }> = {
  pendente:             { label: 'Pendente',       badge: 'bg-orange-100 text-orange-700 border-orange-300', border: 'border-orange-400' },
  separando:            { label: 'Separando',       badge: 'bg-yellow-100 text-yellow-700 border-yellow-300', border: 'border-yellow-400' },
  faturado:             { label: 'Faturado',        badge: 'bg-blue-100   text-blue-700   border-blue-300',   border: 'border-blue-400'   },
  aguardando_etiquetar: { label: 'Ag. etiquetar',  badge: 'bg-gray-100   text-gray-600   border-gray-300',   border: 'border-gray-400'   },
  concluido:            { label: 'Concluído',       badge: 'bg-green-100  text-green-700  border-green-300',  border: 'border-green-400'  },
  cancelado:            { label: 'Cancelado',       badge: 'bg-red-100    text-red-700    border-red-300',    border: 'border-red-400'    },
}

const FALLBACK = { label: '', badge: 'bg-gray-100 text-gray-500 border-gray-300', border: 'border-gray-300' }

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { ...FALLBACK, label: status }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

export function statusBorderClass(status: string): string {
  return (STATUS_CONFIG[status] ?? FALLBACK).border
}
