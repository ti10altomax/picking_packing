'use client'
import { useEffect } from 'react'
import { relatoDe, reportarErro } from '@/lib/erros'

/**
 * Último recurso: erro no próprio layout raiz (fontes, providers). Precisa
 * renderizar <html>/<body> porque o layout quebrou. Mesmo relato do error.tsx.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportarErro(relatoDe(error, { tipo: 'render_global', digest: error.digest }))
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#faf9f5', color: '#1c1917', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#dc2626', margin: 0 }}>Algo quebrou</p>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: '8px 0 0' }}>O Separa não conseguiu abrir</h1>
            <p style={{ fontSize: 14, color: '#57534e', margin: '8px 0 0' }}>O problema já foi registrado para a TI.</p>
            <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#a8a29e', margin: '12px 0 0', wordBreak: 'break-word' }}>{error.message}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={reset} style={{ flex: 1, background: '#18181b', color: '#fff', border: 0, borderRadius: 12, padding: 12, fontSize: 14, fontWeight: 600, minHeight: 44 }}>
                Tentar de novo
              </button>
              <a href="/" style={{ flex: 1, border: '1px solid #e7e5e4', borderRadius: 12, padding: 12, fontSize: 14, textAlign: 'center', color: '#1c1917', textDecoration: 'none', minHeight: 44, boxSizing: 'border-box' }}>
                Ir para o início
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
