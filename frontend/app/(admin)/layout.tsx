'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { destinoPorPerfil } from '@/lib/destino'
import { useAuthStore } from '@/stores/authStore'
import { useExitGuard } from '@/lib/useExitGuard'
import { FullscreenOnFirstTap, FullscreenToggle } from '@/components/FullscreenLayer'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
    if (user && user.perfil !== 'admin') router.replace('/login')
  }, [ready, token, user])

  if (!ready || !token) return null

  return (
    <div className="min-h-screen bg-surface-bg text-ink flex flex-col">
      <FullscreenOnFirstTap />
      <header className="bg-surface-card border-b border-surface-border px-4 h-14 flex items-center justify-between sticky top-0 z-10 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3">
          <Link href={destinoPorPerfil(user?.perfil)} className="font-display italic font-semibold text-xl tracking-tight hover:opacity-70 transition-opacity">Separa</Link>
          <span className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">Admin</span>
        </div>
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
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
