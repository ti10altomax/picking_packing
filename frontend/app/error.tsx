'use client'
import { useEffect } from 'react'
import { relatoDe, reportarErro } from '@/lib/erros'

/**
 * Error boundary de todas as rotas (Next App Router). Quando um render
 * quebra, em vez da tela branca: relata ao backend (Admin → Saúde) e dá
 * para o usuário "Tentar de novo" ou voltar ao início sem perder o login.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarErro(relatoDe(error, { tipo: 'render', digest: error.digest }))
  }, [error])

  return (
    <div className="min-h-screen bg-surface-bg text-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-surface-card border border-red-200 dark:border-red-500/30 rounded-2xl p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-400">Algo quebrou</p>
        <h1 className="text-xl font-semibold mt-2">Esta tela deu erro</h1>
        <p className="text-sm text-ink-muted mt-2">
          O problema já foi registrado para a TI. Você pode tentar de novo ou voltar ao início — o login continua valendo.
        </p>
        <p className="mt-3 text-xs font-mono text-ink-subtle break-words">{error.message}</p>
        <div className="flex gap-2 mt-5">
          <button
            onClick={reset}
            className="flex-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl py-3 text-sm font-semibold min-h-[44px]"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="flex-1 border border-surface-border text-ink rounded-xl py-3 text-sm text-center min-h-[44px] flex items-center justify-center hover:bg-surface-elev"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  )
}
