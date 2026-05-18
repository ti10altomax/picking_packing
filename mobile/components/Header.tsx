import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
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
      <Text className="text-lg font-bold text-ink tracking-tight">{title}</Text>
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
