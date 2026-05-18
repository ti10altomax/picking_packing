import '../global.css'
import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { DialogProvider } from '@/components/Dialog'
import { useThemeStore } from '@/stores/themeStore'
import { temaLight, temaDark } from '@/lib/temas'

export default function RootLayout() {
  const { resolved, hydrated, hydrate } = useThemeStore()

  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrated, hydrate])

  const tema = resolved === 'dark' ? temaDark : temaLight
  // Cor de fundo nativa do Stack — precisa casar com surface-bg
  const stackBg = resolved === 'dark' ? '#09090b' : '#f9fafb'

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[{ flex: 1 }, tema]}>
        <SafeAreaProvider>
          <DialogProvider>
            <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: stackBg },
                animation: 'fade',
              }}
            />
          </DialogProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  )
}
