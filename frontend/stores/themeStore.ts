'use client'
import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeStore {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  hydrate: () => void
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

function aplicar(modo: ThemeMode): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const eff = modo === 'system' ? sys : modo
  document.documentElement.classList.toggle('dark', eff === 'dark')
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', eff === 'dark' ? '#09090b' : '#111827')
  return eff
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  resolved: 'light',
  hydrate: () => {
    if (typeof window === 'undefined') return
    const saved = (localStorage.getItem('theme') as ThemeMode | null) ?? 'system'
    const resolved = aplicar(saved)
    set({ mode: saved, resolved })

    if (saved === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const cb = () => {
        if (get().mode !== 'system') return
        set({ resolved: aplicar('system') })
      }
      mq.addEventListener?.('change', cb)
    }
  },
  setMode: (modo) => {
    if (typeof window !== 'undefined') localStorage.setItem('theme', modo)
    set({ mode: modo, resolved: aplicar(modo) })
  },
  toggle: () => {
    const atual = get().resolved
    get().setMode(atual === 'dark' ? 'light' : 'dark')
  },
}))
