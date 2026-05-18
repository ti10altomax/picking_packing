'use client'
import { useEffect } from 'react'

/**
 * Bloqueia o botão "voltar" do dispositivo silenciosamente.
 *
 * Funciona empurrando um state-sentinel para o histórico. Quando o usuário
 * pressiona voltar, o navegador consome o sentinel mas a URL não muda — e
 * nós empurramos outro sentinel pra continuar protegendo.
 *
 * Resultado: voltar do dispositivo não fecha o app nem navega entre páginas
 * via histórico do navegador. Use os botões ← internos das telas pra navegar.
 */
export function useExitGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    let ativo = true

    const empurrar = () => {
      try {
        window.history.pushState({ guard: true }, '', window.location.href)
      } catch { /* noop */ }
    }

    empurrar()

    const handler = () => {
      if (!ativo) return
      empurrar()
    }

    window.addEventListener('popstate', handler)
    return () => {
      ativo = false
      window.removeEventListener('popstate', handler)
    }
  }, [])
}
