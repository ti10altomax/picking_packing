import '../global.css'
import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import {
  Fraunces_600SemiBold,
  Fraunces_600SemiBold_Italic,
} from '@expo-google-fonts/fraunces'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono'
import { DialogProvider } from '@/components/Dialog'
import { useThemeStore } from '@/stores/themeStore'
import { temaLight, temaDark } from '@/lib/temas'

export default function RootLayout() {
  const { resolved, hydrated, hydrate } = useThemeStore()

  // Fontes empacotadas no APK (via @expo-google-fonts) — zero rede em runtime
  const [fontesProntas] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_600SemiBold_Italic,
    JetBrainsMono_500Medium,
  })

  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrated, hydrate])

  if (!fontesProntas) return null

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
