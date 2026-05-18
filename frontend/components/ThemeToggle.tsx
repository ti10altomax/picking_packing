'use client'
import { useEffect, useState } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeProvider() {
  const hydrate = useThemeStore((s) => s.hydrate)
  useEffect(() => { hydrate() }, [hydrate])
  return null
}

export function ThemeToggle() {
  const { resolved, toggle } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <span className="w-11 h-11 inline-block" aria-hidden="true" />

  return (
    <button
      onClick={toggle}
      title={resolved === 'dark' ? 'Tema claro' : 'Tema escuro'}
      aria-label="Alternar tema"
      className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
    >
      {resolved === 'dark' ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
