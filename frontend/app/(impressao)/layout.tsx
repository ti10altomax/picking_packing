'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

/**
 * Páginas de impressão (etiquetas 10x15 pelo navegador) — sem cabeçalho do
 * sistema, só a guarda de login. Qualquer perfil logado pode abrir.
 */
export default function ImpressaoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { token, hydrate } = useAuthStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    hydrate()
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready && !token) router.replace('/login')
  }, [ready, token])

  if (!ready || !token) return null
  return <>{children}</>
}
