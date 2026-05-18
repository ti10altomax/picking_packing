'use client'

const FILTROS = [
  { label: 'Todos',         value: '' },
  { label: 'Pendente',      value: 'pendente' },
  { label: 'Separando',     value: 'separando' },
  { label: 'Faturado',      value: 'faturado' },
  { label: 'Ag. etiquetar', value: 'aguardando_etiquetar' },
  { label: 'Concluído',     value: 'concluido' },
]

interface Props {
  current: string
  onChange: (value: string) => void
}

export function FilterBar({ current, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 px-4" style={{ scrollbarWidth: 'none' }}>
      {FILTROS.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px] ${
            current === f.value
              ? 'bg-gray-900 text-white'
              : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
