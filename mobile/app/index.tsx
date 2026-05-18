import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'

/**
 * Entry point — hidrata sessão do SecureStore e redireciona:
 *  - logado → tela do perfil
 *  - sem sessão → /login
 */
export default function Index() {
  const router = useRouter()
  const { hydrate, hydrated, token, user } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (token && user) {
      router.replace(destinoPorPerfil(user.perfil) as never)
    } else {
      router.replace('/login')
    }
  }, [hydrated, token, user])

  return (
    <View className="flex-1 items-center justify-center bg-surface-bg">
      <ActivityIndicator size="large" color="#a1a1aa" />
    </View>
  )
}
