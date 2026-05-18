'use client'
import {
  createContext, useContext, useState, useRef, useEffect,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'question'

type DialogConfig = {
  title?: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: Variant
  showCancel?: boolean
}

type Internal = DialogConfig & {
  id: number
  resolve: (v: boolean) => void
}

type DialogApi = {
  confirm: (cfg: DialogConfig) => Promise<boolean>
  alert: (cfg: Omit<DialogConfig, 'showCancel'>) => Promise<void>
}

const Ctx = createContext<DialogApi | null>(null)

// -----------------------------------------------------------------------------
// Provider — pendura no <body> via portal
// -----------------------------------------------------------------------------

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Internal[]>([])
  const [mounted, setMounted] = useState(false)
  const idRef = useRef(0)

  useEffect(() => setMounted(true), [])

  const abrir = (cfg: DialogConfig, defaultShowCancel: boolean) =>
    new Promise<boolean>((resolve) => {
      const id = ++idRef.current
      setStack((s) => [
        ...s,
        { ...cfg, showCancel: cfg.showCancel ?? defaultShowCancel, id, resolve },
      ])
    })

  const fechar = (id: number, valor: boolean) => {
    setStack((s) => {
      const alvo = s.find((x) => x.id === id)
      if (alvo) alvo.resolve(valor)
      return s.filter((x) => x.id !== id)
    })
  }

  const api: DialogApi = {
    confirm: (cfg) => abrir(cfg, true),
    alert: (cfg) => abrir(cfg, false).then(() => undefined),
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && createPortal(
        <>{stack.map((d) => <DialogUI key={d.id} cfg={d} fechar={fechar} />)}</>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDialog precisa estar dentro de <DialogProvider />')
  return ctx
}

// -----------------------------------------------------------------------------
// UI de cada dialog na pilha
// -----------------------------------------------------------------------------

function DialogUI({
  cfg,
  fechar,
}: {
  cfg: Internal
  fechar: (id: number, v: boolean) => void
}) {
  const [aberto, setAberto] = useState(false)
  const fechandoRef = useRef(false)

  useEffect(() => {
    const t = setTimeout(() => setAberto(true), 10)
    return () => clearTimeout(t)
  }, [])

  const cancelar = () => {
    if (fechandoRef.current) return
    fechandoRef.current = true
    setAberto(false)
    setTimeout(() => fechar(cfg.id, false), 150)
  }

  const confirmar = () => {
    if (fechandoRef.current) return
    fechandoRef.current = true
    setAberto(false)
    setTimeout(() => fechar(cfg.id, true), 150)
  }

  // ESC cancela; Enter confirma
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelar()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        confirmar()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const variant = cfg.variant ?? 'question'
  const cor = corPorVariante(variant)

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-150 ${
        aberto ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={cfg.showCancel ? cancelar : confirmar}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dlg-${cfg.id}-title`}
        className={`relative bg-surface-card text-ink rounded-2xl border border-surface-border shadow-2xl w-full max-w-sm p-6 transition-all duration-150 ${
          aberto ? 'scale-100' : 'scale-95'
        }`}
      >
        <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${cor.bg}`}>
          <Icone variant={variant} className={cor.icon} />
        </div>

        {cfg.title && (
          <h2 id={`dlg-${cfg.id}-title`} className="text-lg font-bold text-center mb-1 text-ink">
            {cfg.title}
          </h2>
        )}
        {cfg.message && (
          <div className="text-sm text-ink-muted text-center mb-6">
            {cfg.message}
          </div>
        )}

        <div className="flex gap-2">
          {cfg.showCancel && (
            <button
              onClick={cancelar}
              className="flex-1 h-11 bg-surface-elev text-ink rounded-xl font-medium hover:bg-surface-border transition-colors"
            >
              {cfg.cancelText ?? 'Cancelar'}
            </button>
          )}
          <button
            onClick={confirmar}
            autoFocus
            className={`flex-1 h-11 rounded-xl font-bold transition-all ${cor.button}`}
          >
            {cfg.confirmText ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Cores por variante
// -----------------------------------------------------------------------------

function corPorVariante(v: Variant) {
  switch (v) {
    case 'success':
      return {
        bg: 'bg-emerald-100 dark:bg-emerald-500/15',
        icon: 'text-emerald-600 dark:text-emerald-400',
        button: 'bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20',
      }
    case 'danger':
      return {
        bg: 'bg-red-100 dark:bg-red-500/15',
        icon: 'text-red-600 dark:text-red-400',
        button: 'bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400 text-white shadow-lg shadow-red-500/20',
      }
    case 'warning':
      return {
        bg: 'bg-amber-100 dark:bg-amber-500/15',
        icon: 'text-amber-600 dark:text-amber-400',
        button: 'bg-amber-600 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400 text-white shadow-lg shadow-amber-500/20',
      }
    case 'info':
      return {
        bg: 'bg-blue-100 dark:bg-blue-500/15',
        icon: 'text-blue-600 dark:text-blue-400',
        button: 'bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shadow-lg shadow-blue-500/20',
      }
    default:
      return {
        bg: 'bg-zinc-100 dark:bg-zinc-800',
        icon: 'text-ink',
        button: 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900',
      }
  }
}

// -----------------------------------------------------------------------------
// Ícones
// -----------------------------------------------------------------------------

function Icone({ variant, className }: { variant: Variant; className: string }) {
  const p = {
    width: 28, height: 28, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: 2.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className,
  }
  switch (variant) {
    case 'success':
      return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>
    case 'danger':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...p}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
    case 'info':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )
    default:
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )
  }
}
