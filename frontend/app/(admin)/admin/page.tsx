'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  pedidosApi, supervisorApi, separadoresApi, fechamentosApi,
  type Paginado,
} from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

type Contadores = {
  pendentes: number | null
  aguardandoSequencia: number | null
  liberadosHoje: number | null
  emConferencia: number | null
  naoConformes: number | null
  fechamentos: number | null
  conferidos: number | null
}

function contar(data: Paginado<unknown> | unknown[]): number {
  return Array.isArray(data) ? data.length : data.count
}

// Ícones inline (traço 2px, estilo lucide) — sem emoji, renderizam igual em tudo
const ICONES: Record<string, React.ReactNode> = {
  vendas: <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Zm-3 4h18M16 10a4 4 0 0 1-8 0" />,
  patio: <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35ZM6 18h12M6 14h12" />,
  separadores: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  conferencia: <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />,
  naoconformes: <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" />,
  fechamentos: <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />,
  conferidos: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />,
  erros: <path d="M3 3v18h18M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />,
  divergencias: <path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14" />,
}

function Icone({ nome, className }: { nome: string; className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}
    >
      {ICONES[nome]}
    </svg>
  )
}

function Contador({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="font-display text-4xl font-semibold leading-none text-ink-subtle animate-pulse">–</span>
  }
  return <span className="font-display text-4xl font-semibold leading-none text-ink tabular-nums">{valor}</span>
}

export default function AdminPage() {
  const { user, hydrate } = useAuthStore()
  const [c, setC] = useState<Contadores>({
    pendentes: null, aguardandoSequencia: null, liberadosHoje: null,
    emConferencia: null, naoConformes: null, fechamentos: null, conferidos: null,
  })

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    const definir = (chave: keyof Contadores) => (v: number) =>
      setC((prev) => ({ ...prev, [chave]: v }))

    pedidosApi.listar({ status: 'pendente' }).then((d) => definir('pendentes')(contar(d))).catch(() => {})
    supervisorApi.listarSelecionados({ sem_sequencia: '1' }).then((d) => definir('aguardandoSequencia')(contar(d))).catch(() => {})
    separadoresApi.liberados().then((d) => definir('liberadosHoje')(d.length)).catch(() => {})
    pedidosApi.listar({ status: 'conferindo' }).then((d) => definir('emConferencia')(contar(d))).catch(() => {})
    supervisorApi.listarNaoConformes().then((d) => definir('naoConformes')(d.length)).catch(() => {})
    fechamentosApi.listar().then((d) => definir('fechamentos')(d.length)).catch(() => {})
    supervisorApi.listarConferidos().then((d) => definir('conferidos')(contar(d))).catch(() => {})
  }, [])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataLonga = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const OPERACAO = [
    {
      href: '/supervisor/vendas',
      area: 'Vendas', icone: 'vendas',
      accent: 'text-orange-600 dark:text-orange-400',
      blob: 'bg-orange-400/15',
      hover: 'hover:border-orange-300 dark:hover:border-orange-500/50',
      valor: c.pendentes, unidade: 'pendentes do Senior',
      titulo: 'Selecionar pedidos',
    },
    {
      href: '/supervisor/patio',
      area: 'Pátio', icone: 'patio',
      accent: 'text-amber-600 dark:text-amber-400',
      blob: 'bg-amber-400/15',
      hover: 'hover:border-amber-300 dark:hover:border-amber-500/50',
      valor: c.aguardandoSequencia, unidade: 'aguardando sequência',
      titulo: 'Montar sequências',
    },
    {
      href: '/supervisor/separadores',
      area: 'Pátio', icone: 'separadores',
      accent: 'text-violet-600 dark:text-violet-400',
      blob: 'bg-violet-400/15',
      hover: 'hover:border-violet-300 dark:hover:border-violet-500/50',
      valor: c.liberadosHoje, unidade: 'liberados hoje',
      titulo: 'Separadores do dia',
    },
    {
      href: '/conferencia',
      area: 'Conferência', icone: 'conferencia',
      accent: 'text-blue-600 dark:text-blue-400',
      blob: 'bg-blue-400/15',
      hover: 'hover:border-blue-300 dark:hover:border-blue-500/50',
      valor: c.emConferencia, unidade: 'em conferência agora',
      titulo: 'Conferir pedidos',
    },
  ]

  const GESTAO = [
    {
      href: '/supervisor/nao-conformes',
      titulo: 'Não conformes', icone: 'naoconformes',
      valor: c.naoConformes,
      alerta: (c.naoConformes ?? 0) > 0,
      corAlerta: 'text-red-600 dark:text-red-400',
    },
    {
      href: '/supervisor/fechamentos',
      titulo: 'Fechamentos', icone: 'fechamentos',
      valor: c.fechamentos,
      alerta: (c.fechamentos ?? 0) > 0,
      corAlerta: 'text-violet-600 dark:text-violet-400',
    },
    {
      href: '/supervisor/conferidos',
      titulo: 'Conferidos', icone: 'conferidos',
      valor: c.conferidos,
      alerta: false,
      corAlerta: '',
    },
    { href: '/supervisor/erros', titulo: 'Erros de separação', icone: 'erros', valor: null, alerta: false, corAlerta: '' },
    { href: '/supervisor/divergencias', titulo: 'Divergências de barra', icone: 'divergencias', valor: null, alerta: false, corAlerta: '' },
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* Saudação */}
      <h1 className="text-3xl font-semibold text-ink leading-tight">
        {saudacao}{user?.username ? `, ${user.username}` : ''}
      </h1>
      <p className="text-sm text-ink-muted mt-1 mb-8 first-letter:uppercase">{dataLonga} · visão geral da operação</p>

      {/* Operação — cards com contadores vivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
        {OPERACAO.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={`group relative overflow-hidden bg-surface-card border border-surface-border rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl dark:hover:shadow-black/40 ${card.hover}`}
          >
            <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl pointer-events-none ${card.blob}`} />
            <div className="flex items-center justify-between">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${card.accent}`}>
                {card.area}
              </p>
              <span className={card.accent}><Icone nome={card.icone} /></span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <Contador valor={card.valor} />
              <span className="text-xs text-ink-subtle">{card.unidade}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="font-semibold text-ink">{card.titulo}</p>
              <span className="text-ink-subtle opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">→</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Gestão — linha compacta */}
      <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Gestão</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
        {GESTAO.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-3 bg-surface-card border rounded-xl px-4 py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 ${
              item.alerta
                ? 'border-red-200 dark:border-red-500/30'
                : 'border-surface-border'
            }`}
          >
            <span className={item.alerta ? item.corAlerta : 'text-ink-subtle group-hover:text-ink transition-colors'}>
              <Icone nome={item.icone} />
            </span>
            <span className="text-sm font-medium text-ink flex-1 leading-snug">{item.titulo}</span>
            {item.valor !== null && item.valor > 0 && (
              <span className={`font-display text-lg font-semibold tabular-nums ${item.alerta ? item.corAlerta : 'text-ink-muted'}`}>
                {item.valor}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* Módulos congelados — rebaixados a links discretos */}
      <p className="text-xs text-ink-subtle">
        Módulos congelados:{' '}
        <Link href="/pedidos" className="underline underline-offset-2 hover:text-ink transition-colors">
          conferente legado
        </Link>
        {' · '}
        <Link href="/etiquetador" className="underline underline-offset-2 hover:text-ink transition-colors">
          etiquetador
        </Link>
      </p>
    </div>
  )
}
