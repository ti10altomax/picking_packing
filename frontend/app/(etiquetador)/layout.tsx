'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function EtiquetadorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, user, hydrate, logout } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    hydrate()
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!token) { router.replace('/login'); return }
    if (user && user.perfil === 'conferente') router.replace('/conferencia')
  }, [ready, token, user])

  if (!ready || !token) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 h-14 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <span className="font-bold text-lg tracking-tight">Separa</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{user?.username}</span>
          <button
            onClick={() => { logout(); router.push('/login') }}
            className="text-sm text-gray-400 hover:text-gray-700 min-h-[44px] px-2"
          >
            Sair
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
