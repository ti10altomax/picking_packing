'use client'
import Link from 'next/link'

const PRINCIPAL = [
  {
    href: '/supervisor/vendas',
    titulo: 'Sup. Vendas — Selecionar pedidos',
    descricao: 'Lista pedidos pendentes do Senior e envia para conferência',
    cor: 'border-orange-200 hover:border-orange-400 dark:border-orange-500/30 dark:hover:border-orange-500/70',
    glow: 'dark:hover:shadow-orange-500/10',
  },
  {
    href: '/supervisor/patio',
    titulo: 'Sup. Pátio — Atribuir',
    descricao: 'Lista pedidos selecionados e atribui a um conferente',
    cor: 'border-amber-200 hover:border-amber-400 dark:border-amber-500/30 dark:hover:border-amber-500/70',
    glow: 'dark:hover:shadow-amber-500/10',
  },
  {
    href: '/supervisor/separadores',
    titulo: 'Separadores — Cadastro e liberação',
    descricao: 'Cadastra separadores físicos e marca quem está liberado hoje',
    cor: 'border-violet-200 hover:border-violet-400 dark:border-violet-500/30 dark:hover:border-violet-500/70',
    glow: 'dark:hover:shadow-violet-500/10',
  },
  {
    href: '/conferencia',
    titulo: 'Conferente — Atribuídos a mim',
    descricao: 'Lista pedidos atribuídos ao usuário logado e tela de conferência por volumes',
    cor: 'border-blue-200 hover:border-blue-400 dark:border-blue-500/30 dark:hover:border-blue-500/70',
    glow: 'dark:hover:shadow-blue-500/10',
  },
  {
    href: '/supervisor/conferidos',
    titulo: 'Pedidos conferidos',
    descricao: 'Histórico dos pedidos concluídos com quem separou',
    cor: 'border-emerald-200 hover:border-emerald-400 dark:border-emerald-500/30 dark:hover:border-emerald-500/70',
    glow: 'dark:hover:shadow-emerald-500/10',
  },
  {
    href: '/supervisor/nao-conformes',
    titulo: 'Não conformes',
    descricao: 'Pedidos com problema na conferência — cancelar ou retornar para fila',
    cor: 'border-red-200 hover:border-red-400 dark:border-red-500/30 dark:hover:border-red-500/70',
    glow: 'dark:hover:shadow-red-500/10',
  },
]

const CONGELADOS = [
  {
    href: '/pedidos',
    titulo: 'Conferente (legado)',
    descricao: 'Fluxo antigo de bipagem com endereço — preservado mas fora do escopo atual',
  },
  {
    href: '/etiquetador',
    titulo: 'Etiquetador (legado)',
    descricao: 'Fluxo antigo de etiquetagem em lote — fora do escopo atual',
  },
]

export default function AdminPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1 text-ink">Administração</h1>
      <p className="text-sm text-ink-muted mb-6">
        Acesso direto às telas do sistema (admin pode entrar em todas).
      </p>

      <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-2">Fluxo atual</h2>
      <div className="space-y-2 mb-8">
        {PRINCIPAL.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block bg-surface-card text-ink border-2 rounded-xl p-4 transition-all hover:shadow-lg ${item.cor} ${item.glow}`}
          >
            <p className="font-semibold">{item.titulo}</p>
            <p className="text-sm text-ink-muted mt-0.5">{item.descricao}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-wide mb-2">Módulos congelados</h2>
      <div className="space-y-2">
        {CONGELADOS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block bg-surface-elev/50 border border-surface-border rounded-xl p-4 opacity-70 hover:opacity-100 transition-opacity"
          >
            <p className="font-medium text-ink-muted">{item.titulo}</p>
            <p className="text-sm text-ink-subtle mt-0.5">{item.descricao}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
