'use client'
import { useEffect, useRef } from 'react'
import { useFullscreen } from '@/lib/useFullscreen'

/**
 * Botão pequeno que entra/sai de fullscreen.
 * O navegador exige gesto do usuário, então não dá pra forçar no load —
 * o usuário toca uma vez e a partir daí fica em tela cheia.
 */
export function FullscreenToggle() {
  const { isFs, toggle } = useFullscreen()
  return (
    <button
      onClick={toggle}
      title={isFs ? 'Sair de tela cheia' : 'Tela cheia'}
      className="text-gray-400 hover:text-gray-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
      aria-label="Tela cheia"
    >
      {isFs ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7V5a2 2 0 0 1 2-2h2m10 0h2a2 2 0 0 1 2 2v2m0 10v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
        </svg>
      )}
    </button>
  )
}

/**
 * Mantém o app em fullscreen — a cada gesto do usuário, se não estiver em
 * fullscreen, re-entra. Necessário porque alguns navegadores (Android Chrome
 * em particular) saem de fullscreen ao navegar entre páginas.
 *
 * O re-entrar acontece "carona" no próprio toque que o usuário deu pra
 * navegar/clicar — assim a regra de "exige gesto" continua sendo satisfeita.
 */
export function FullscreenOnFirstTap() {
  const { isFs, enter } = useFullscreen()
  const ultimaTentativa = useRef(0)

  useEffect(() => {
    const tentar = () => {
      // Throttle — evita disparar várias vezes pelo mesmo gesto
      const agora = Date.now()
      if (agora - ultimaTentativa.current < 500) return
      ultimaTentativa.current = agora
      if (!isFs) enter()
    }
    window.addEventListener('pointerdown', tentar)
    return () => window.removeEventListener('pointerdown', tentar)
  }, [isFs, enter])

  return null
}
