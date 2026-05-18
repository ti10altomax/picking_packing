'use client'
import { useEffect, useState, useCallback } from 'react'

type DocFS = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}
type ElFS = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

function getFsElement() {
  const d = document as DocFS
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function useFullscreen() {
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
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

  const toggle = useCallback(() => (isFs ? exit() : enter()), [isFs, enter, exit])

  return { isFs, enter, exit, toggle }
}
