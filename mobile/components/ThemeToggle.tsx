import { Pressable, Text } from 'react-native'
import { useThemeStore } from '@/stores/themeStore'

export function ThemeToggle() {
  const { resolved, toggle } = useThemeStore()

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel="Alternar tema"
      className="w-11 h-11 items-center justify-center"
    >
      <Text style={{ fontSize: 20 }}>
        {resolved === 'dark' ? '☀️' : '🌙'}
      </Text>
    </Pressable>
  )
}
