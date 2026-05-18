'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useExitGuard } from '@/lib/useExitGuard'
import { FullscreenOnFirstTap, FullscreenToggle } from '@/components/FullscreenLayer'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function SeparadorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, user, hydrate, logout } = useAuthStore()
  const [ready, setReady] = useState(false)

  useExitGuard()

  useEffect(() => {
    hydrate()
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!token) { router.replace('/login'); return }
    if (user && user.perfil === 'etiquetador') router.replace('/etiquetador')
  }, [ready, token, user])

  if (!ready || !token) return null

  return (
    <div className="min-h-screen bg-surface-bg text-ink flex flex-col">
      <FullscreenOnFirstTap />
      <header className="bg-surface-card border-b border-surface-border px-4 h-14 flex items-center justify-between sticky top-0 z-10 shadow-sm dark:shadow-none">
        <span className="font-bold text-lg tracking-tight">Separa</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <FullscreenToggle />
          <span className="text-sm text-ink-muted">{user?.username}</span>
          <button
            onClick={() => { logout(); router.push('/login') }}
            className="text-sm text-ink-subtle hover:text-ink min-h-[44px] px-2 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
