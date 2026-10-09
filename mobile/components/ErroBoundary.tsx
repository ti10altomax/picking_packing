import { useEffect } from 'react'
import { View, Text, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import type { ErrorBoundaryProps } from 'expo-router'
import { relatoDe, reportarErro } from '@/lib/erros'

/**
 * Tela de erro do app (observabilidade, 2026-10-08). O expo-router chama
 * isto quando um render quebra em qualquer rota (exportado em app/_layout.tsx).
 * Relata ao backend (Admin → Saúde) e deixa o conferente tentar de novo ou
 * voltar ao início sem perder o login.
 */
export function ErroBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter()

  useEffect(() => {
    reportarErro(relatoDe(error, { tipo: 'render' }))
  }, [error])

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-bg">
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-full bg-surface-card border border-red-300 dark:border-red-500/40 rounded-2xl p-5">
          <Text className="text-[11px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">Algo quebrou</Text>
          <Text className="text-xl font-bold text-ink mt-2">Esta tela deu erro</Text>
          <Text className="text-sm text-ink-muted mt-2">
            O problema já foi registrado para a TI. Tente de novo ou volte ao início — o login continua valendo.
          </Text>
          <Text className="text-xs text-ink-subtle mt-3 font-mono" numberOfLines={4}>{error.message}</Text>
          <View className="flex-row gap-2 mt-5">
            <Pressable
              onPress={retry}
              className="flex-1 bg-zinc-900 dark:bg-zinc-100 rounded-xl h-12 items-center justify-center"
            >
              <Text className="text-white dark:text-zinc-900 font-semibold">Tentar de novo</Text>
            </Pressable>
            <Pressable
              onPress={() => router.replace('/' as never)}
              className="flex-1 border border-surface-border rounded-xl h-12 items-center justify-center"
            >
              <Text className="text-ink">Ir para o início</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}
