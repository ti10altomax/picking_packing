import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'
import { ThemeToggle } from '@/components/ThemeToggle'

export function Header({ title }: { title: string }) {
  const router = useRouter()
  const { user, logout } = useAuthStore()

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  return (
    <View className="bg-surface-card border-b border-surface-border px-4 h-14 flex-row items-center justify-between">
      <View className="flex-row items-baseline gap-2 flex-1 mr-2">
        {/* Logotipo = botão de "casa" do perfil (padrão do web) */}
        <Pressable onPress={() => router.replace(destinoPorPerfil(user?.perfil) as never)} hitSlop={8}>
          <Text className="font-display-italic text-xl text-ink">Separa</Text>
        </Pressable>
        <Text className="text-ink-subtle">·</Text>
        <Text className="text-base text-ink-muted flex-1" numberOfLines={1}>{title}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm text-ink-muted">{user?.username}</Text>
        <ThemeToggle />
        <Pressable onPress={handleLogout} className="px-2 h-11 items-center justify-center">
          <Text className="text-sm text-ink-subtle">Sair</Text>
        </Pressable>
      </View>
    </View>
  )
}
