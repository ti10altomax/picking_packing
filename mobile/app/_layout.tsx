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

  // Fontes: embutidas NATIVAMENTE em android/app/src/main/assets/fonts/ —
  // o Android resolve o fontFamily direto (Fraunces_600SemiBold etc.), sem
  // carregamento em runtime e sem depender de rede. Os TTFs vêm dos pacotes
  // @expo-google-fonts (copiados de node_modules).
  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrated, hydrate])

  const tema = resolved === 'dark' ? temaDark : temaLight
  // Cor de fundo nativa do Stack — precisa casar com surface-bg
  const stackBg = resolved === 'dark' ? '#0c0a09' : '#faf9f5'

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
