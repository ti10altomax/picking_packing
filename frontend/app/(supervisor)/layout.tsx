'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useExitGuard } from '@/lib/useExitGuard'
import { FullscreenOnFirstTap, FullscreenToggle } from '@/components/FullscreenLayer'
import { ThemeToggle } from '@/components/ThemeToggle'

const PERFIS_PERMITIDOS = ['supervisor_vendas', 'supervisor_patio', 'admin']

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
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
    if (user && !PERFIS_PERMITIDOS.includes(user.perfil)) {
      router.replace('/login')
    }
  }, [ready, token, user])

  if (!ready || !token) return null

  const podeVendas = user?.perfil === 'supervisor_vendas' || user?.perfil === 'admin'
  const podePatio = user?.perfil === 'supervisor_patio' || user?.perfil === 'admin'
  const podeNaoConformes = podeVendas || podePatio

  return (
    <div className="min-h-screen bg-surface-bg text-ink flex flex-col">
      <FullscreenOnFirstTap />
      <header className="bg-surface-card border-b border-surface-border px-4 h-14 flex items-center justify-between sticky top-0 z-10 shadow-sm dark:shadow-none">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg tracking-tight">Separa</span>
          <nav className="flex items-center gap-1 ml-2">
            {podeVendas && (
              <NavLink href="/supervisor/vendas" ativo={pathname?.startsWith('/supervisor/vendas')}>
                Vendas
              </NavLink>
            )}
            {podePatio && (
              <NavLink href="/supervisor/patio" ativo={pathname?.startsWith('/supervisor/patio')}>
                Pátio
              </NavLink>
            )}
            {podeNaoConformes && (
              <NavLink
                href="/supervisor/nao-conformes"
                ativo={pathname?.startsWith('/supervisor/nao-conformes')}
              >
                Não conformes
              </NavLink>
            )}
            {podeNaoConformes && (
              <NavLink
                href="/supervisor/separados"
                ativo={pathname?.startsWith('/supervisor/separados')}
              >
                Separados
              </NavLink>
            )}
          </nav>
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
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}

function NavLink({ href, ativo, children }: { href: string; ativo?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`text-sm px-3 py-1.5 rounded-lg min-h-[40px] inline-flex items-center transition-colors ${
        ativo
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-ink-muted hover:bg-surface-elev hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
