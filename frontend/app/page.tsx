'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'

export default function Home() {
  const router = useRouter()
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (token && raw) {
      try {
        const user = JSON.parse(raw)
        router.replace(destinoPorPerfil(user.perfil))
        return
      } catch { /* fallthrough */ }
    }
    router.replace('/login')
  }, [hydrate, router])

  return null
}
