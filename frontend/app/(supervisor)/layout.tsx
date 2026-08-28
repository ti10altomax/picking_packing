'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'
import { useExitGuard } from '@/lib/useExitGuard'
import { FullscreenOnFirstTap, FullscreenToggle } from '@/components/FullscreenLayer'
import { ThemeToggle } from '@/components/ThemeToggle'

const PERFIS_PERMITIDOS = ['supervisor_vendas', 'supervisor_patio', 'admin']

// Páginas de gestão/relatórios — agrupadas num dropdown pra nav não estourar
const GESTAO_ITEMS: { href: string; label: string; soPatio?: boolean }[] = [
  { href: '/supervisor/nao-conformes', label: 'Não conformes' },
  { href: '/supervisor/divergencias', label: 'Divergências' },
  { href: '/supervisor/fechamentos', label: 'Fechamentos', soPatio: true },
  { href: '/supervisor/erros', label: 'Erros de separação' },
  { href: '/supervisor/conferidos', label: 'Conferidos' },
]

export default function SupervisorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { token, user, hydrate, logout } = useAuthStore()
  const [ready, setReady] = useState(false)
  const [gestaoAberta, setGestaoAberta] = useState(false)

  // Fecha o dropdown ao navegar
  useEffect(() => { setGestaoAberta(false) }, [pathname])

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
          <Link href={destinoPorPerfil(user?.perfil)} className="font-display italic font-semibold text-xl tracking-tight hover:opacity-70 transition-opacity">Separa</Link>
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
            {podePatio && (
              <NavLink href="/supervisor/separadores" ativo={pathname?.startsWith('/supervisor/separadores')}>
                Separadores
              </NavLink>
            )}
            {podeNaoConformes && (
              <div className="relative">
                <button
                  onClick={() => setGestaoAberta((v) => !v)}
                  className={`text-sm px-3 py-1.5 rounded-lg min-h-[40px] inline-flex items-center gap-1 transition-colors ${
                    GESTAO_ITEMS.some((i) => pathname?.startsWith(i.href))
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-ink-muted hover:bg-surface-elev hover:text-ink'
                  }`}
                >
                  Gestão
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${gestaoAberta ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {gestaoAberta && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setGestaoAberta(false)} />
                    <div className="absolute left-0 top-full mt-1 z-30 min-w-[200px] bg-surface-card border border-surface-border rounded-xl shadow-xl dark:shadow-black/40 py-1 overflow-hidden">
                      {GESTAO_ITEMS.filter((i) => !i.soPatio || podePatio).map((i) => {
                        const ativo = pathname?.startsWith(i.href)
                        return (
                          <Link
                            key={i.href}
                            href={i.href}
                            className={`block px-4 py-2.5 text-sm min-h-[44px] flex items-center transition-colors ${
                              ativo
                                ? 'bg-surface-elev text-ink font-semibold'
                                : 'text-ink-muted hover:bg-surface-elev hover:text-ink'
                            }`}
                          >
                            {i.label}
                          </Link>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
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
