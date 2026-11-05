'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Toast do sistema (2026-11-05). Para avisos que não pedem resposta — o Dialog continua
 * para confirmação. Feito para ser lido no coletor: texto grande, cor sólida, quebra linha,
 * fica no topo (onde o conferente olha) e não rouba o foco da barra de bipagem.
 *
 *   const toast = useToast()
 *   toast.erro('Documento não encontrado no Separa', { codigo: lido, chave: 'leitor' })
 *   toast.ok('3 pedidos enviados para conferência')
 *
 * `chave` substitui o toast anterior com a mesma chave (uma leitura nova troca o aviso da
 * leitura anterior em vez de empilhar). Passar o mouse em cima pausa o tempo.
 */

export type ToastTipo = 'ok' | 'erro' | 'aviso' | 'info'

export type ToastOpcoes = {
  detalhe?: ReactNode
  /** código lido pelo leitor/câmera — aparece em mono para o conferente conferir o que bipou */
  codigo?: string
  /** ms; padrão por tipo (erro 6 s, aviso 5 s, ok/info 3,5 s) */
  duracao?: number
  chave?: string
}

type Item = ToastOpcoes & { id: number; tipo: ToastTipo; titulo: ReactNode; duracao: number }

type ToastApi = {
  ok: (titulo: ReactNode, op?: ToastOpcoes) => number
  erro: (titulo: ReactNode, op?: ToastOpcoes) => number
  aviso: (titulo: ReactNode, op?: ToastOpcoes) => number
  info: (titulo: ReactNode, op?: ToastOpcoes) => number
  fechar: (id: number) => void
}

const DURACAO: Record<ToastTipo, number> = { erro: 6000, aviso: 5000, ok: 3500, info: 3500 }
const MAX_VISIVEIS = 3

const ESTILO: Record<ToastTipo, { caixa: string; icone: string; barra: string; simbolo: string }> = {
  erro: {
    caixa: 'bg-red-600 text-white shadow-red-900/30',
    icone: 'bg-white/20 text-white',
    barra: 'bg-white/60',
    simbolo: '!',
  },
  aviso: {
    caixa: 'bg-amber-400 text-zinc-950 shadow-amber-900/25',
    icone: 'bg-zinc-950/15 text-zinc-950',
    barra: 'bg-zinc-950/40',
    simbolo: '!',
  },
  ok: {
    caixa: 'bg-emerald-600 text-white shadow-emerald-900/30',
    icone: 'bg-white/20 text-white',
    barra: 'bg-white/60',
    simbolo: '✓',
  },
  info: {
    caixa: 'bg-zinc-900 text-white shadow-black/30 dark:bg-zinc-100 dark:text-zinc-950',
    icone: 'bg-white/15 text-white dark:bg-zinc-950/10 dark:text-zinc-950',
    barra: 'bg-white/50 dark:bg-zinc-950/40',
    simbolo: 'i',
  },
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Item[]>([])
  const [mounted, setMounted] = useState(false)
  const idRef = useRef(0)

  useEffect(() => setMounted(true), [])

  const fechar = useCallback((id: number) => setItens((s) => s.filter((t) => t.id !== id)), [])

  const api = useMemo<ToastApi>(() => {
    const abrir = (tipo: ToastTipo) => (titulo: ReactNode, op: ToastOpcoes = {}) => {
      const id = ++idRef.current
      const item: Item = { ...op, id, tipo, titulo, duracao: op.duracao ?? DURACAO[tipo] }
      setItens((s) => {
        const resto = op.chave ? s.filter((t) => t.chave !== op.chave) : s
        return [...resto, item].slice(-MAX_VISIVEIS)
      })
      return id
    }
    return { ok: abrir('ok'), erro: abrir('erro'), aviso: abrir('aviso'), info: abrir('info'), fechar }
  }, [fechar])

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && createPortal(
        <div
          className="fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none sm:items-end sm:px-6"
          style={{ top: 'calc(env(safe-area-inset-top) + 4rem)' }}
        >
          {itens.map((t) => <ToastUI key={t.id} item={t} fechar={fechar} />)}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}

function ToastUI({ item, fechar }: { item: Item; fechar: (id: number) => void }) {
  const e = ESTILO[item.tipo]
  const [pausado, setPausado] = useState(false)
  const restante = useRef(item.duracao)
  const inicio = useRef(Date.now())

  useEffect(() => {
    if (pausado) return
    inicio.current = Date.now()
    const t = setTimeout(() => fechar(item.id), restante.current)
    return () => {
      clearTimeout(t)
      restante.current -= Date.now() - inicio.current
    }
  }, [pausado, item.id, fechar])

  return (
    <div
      role={item.tipo === 'erro' ? 'alert' : 'status'}
      aria-live={item.tipo === 'erro' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      // não tira o foco da barra de bipagem: o conferente continua bipando por baixo
      onMouseDown={(ev) => ev.preventDefault()}
      className={`toast-entrada pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl shadow-xl ${e.caixa}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-black ${e.icone}`}>
          {e.simbolo}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug break-words first-letter:uppercase">{item.titulo}</p>
          {item.detalhe && <div className="mt-1 text-sm leading-snug opacity-90">{item.detalhe}</div>}
          {item.codigo && (
            <p className="mt-1.5 text-xs opacity-80">
              lido: <span className="font-mono text-[13px] tracking-wide break-all">{item.codigo}</span>
            </p>
          )}
        </div>
        <button
          onClick={() => fechar(item.id)}
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl leading-none opacity-70 hover:opacity-100 hover:bg-black/10"
          aria-label="Fechar aviso"
        >
          ×
        </button>
      </div>
      <span
        className={`toast-tempo absolute bottom-0 left-0 h-1 ${e.barra}`}
        style={{ animationDuration: `${item.duracao}ms`, animationPlayState: pausado ? 'paused' : 'running' }}
      />
    </div>
  )
}
