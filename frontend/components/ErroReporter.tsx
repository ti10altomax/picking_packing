'use client'
import { useEffect } from 'react'
import { relatoDe, reportarErro } from '@/lib/erros'

/**
 * Captura o que escapa do React (observabilidade, 2026-10-08):
 * - `window.onerror` — exceção fora de render (handler de clique, setTimeout);
 * - `unhandledrejection` — promessa sem catch (chamada da API que ninguém tratou).
 * Erros de render passam pelo app/error.tsx. Montado uma vez no layout raiz.
 */
export function ErroReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      reportarErro(ev.error instanceof Error
        ? relatoDe(ev.error, { tipo: 'onerror', arquivo: ev.filename, linha: ev.lineno })
        : { mensagem: ev.message, extra: { tipo: 'onerror', arquivo: ev.filename, linha: ev.lineno } })
    }
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = relatoDe(ev.reason, { tipo: 'unhandledrejection' })
      // 401 é tratado pelo interceptor (refresh / volta ao login) — não é bug
      if ((r.extra as { status?: number } | undefined)?.status === 401) return
      reportarErro(r)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
