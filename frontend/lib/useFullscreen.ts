'use client'
import { useEffect, useState, useCallback } from 'react'

type DocFS = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}
type ElFS = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

/** Preferência por navegador (2026-11-17): a tela cheia automática atrapalhava quem não
 * queria, mas quem gosta quer que ela fique. Desligada por padrão; o botão do cabeçalho
 * liga/desliga e o `FullscreenOnFirstTap` só insiste quando está ligada. */
const CHAVE = 'telaCheia'

function lerPreferencia(): boolean {
  try { return localStorage.getItem(CHAVE) === '1' } catch { return false }
}
function gravarPreferencia(v: boolean) {
  try { localStorage.setItem(CHAVE, v ? '1' : '0') } catch { /* privado/bloqueado */ }
}

function getFsElement() {
  const d = document as DocFS
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function useFullscreen() {
  const [isFs, setIsFs] = useState(false)
  const [manter, setManter] = useState(false)

  useEffect(() => {
    setManter(lerPreferencia())
    const update = () => setIsFs(!!getFsElement())
    update()
    document.addEventListener('fullscreenchange', update)
    document.addEventListener('webkitfullscreenchange', update)
    return () => {
      document.removeEventListener('fullscreenchange', update)
      document.removeEventListener('webkitfullscreenchange', update)
    }
  }, [])

  const enter = useCallback(async () => {
    const el = document.documentElement as ElFS
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
    } catch {
      // Pode falhar se o navegador exigir gesto e não tivermos um
    }
  }, [])

  const exit = useCallback(async () => {
    const d = document as DocFS
    try {
      if (d.exitFullscreen) await d.exitFullscreen()
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen()
    } catch { /* noop */ }
  }, [])

  /** O botão: entrar liga a preferência (fica em tela cheia neste navegador até
   * desligar pelo mesmo botão); sair desliga. */
  const toggle = useCallback(() => {
    if (isFs) {
      gravarPreferencia(false); setManter(false)
      return exit()
    }
    gravarPreferencia(true); setManter(true)
    return enter()
  }, [isFs, enter, exit])

  return { isFs, manter, enter, exit, toggle }
}
