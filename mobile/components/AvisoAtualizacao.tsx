import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { API_URL, appApi, type VersaoApp } from '@/lib/api'
import { VERSAO_APP, versaoMaisNova } from '@/lib/versao'

/**
 * Aviso de versão nova do APK (apps/app_mobile, 2026-10-28).
 *
 * Pergunta ao backend (`GET /api/app/versao/`, sem login) ao abrir e sempre que o
 * app volta do segundo plano (no máximo a cada 5 min). Se a versão publicada é
 * maior que a instalada:
 *  - normal → faixa no rodapé com "Atualizar" (abre o link no navegador; o Android
 *    baixa e oferece Instalar por cima) e um "x" para fechar nesta sessão;
 *  - obrigatória → tela cheia bloqueando até atualizar.
 * Montado uma vez no _layout, por cima do Stack.
 */

const INTERVALO_MS = 5 * 60 * 1000

function mb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(0)} MB`
}

export function AvisoAtualizacao() {
  const insets = useSafeAreaInsets()
  const [nova, setNova] = useState<VersaoApp | null>(null)
  const [fechada, setFechada] = useState<string | null>(null)   // versão dispensada nesta sessão
  const ultimaChecagem = useRef(0)

  const checar = useCallback(async () => {
    if (Date.now() - ultimaChecagem.current < INTERVALO_MS) return
    ultimaChecagem.current = Date.now()
    try {
      const v = await appApi.versao()
      setNova(v.versao && versaoMaisNova(v.versao) ? v : null)
    } catch {
      /* backend fora ou sem rede: fica como está */
    }
  }, [])

  useEffect(() => {
    checar()
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') checar() })
    return () => sub.remove()
  }, [checar])

  if (!nova || (!nova.obrigatoria && fechada === nova.versao)) return null

  // O aparelho já fala com o backend pela API_URL embutida no APK — é a URL certa para
  // baixar também (a `url` do backend é só o fallback, caso o caminho venha vazio).
  const abrir = () => Linking.openURL(nova.caminho ? `${API_URL}${nova.caminho}` : nova.url).catch(() => Linking.openURL(nova.pagina))

  if (nova.obrigatoria) {
    return (
      <View
        className="absolute inset-0 bg-surface-bg items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text className="font-display text-3xl text-ink mb-2">Atualize o Separa</Text>
        <Text className="text-base text-ink-muted text-center mb-1">
          A versão {nova.versao} é obrigatória. Você está na {VERSAO_APP}.
        </Text>
        {!!nova.notas && (
          <Text className="text-sm text-ink-muted text-center mb-4">{nova.notas}</Text>
        )}
        <Pressable
          onPress={abrir}
          className="bg-zinc-900 dark:bg-zinc-100 rounded-2xl px-6 py-4 min-h-[56px] items-center justify-center w-full mt-4"
        >
          <Text className="text-white dark:text-zinc-900 text-lg font-semibold">Baixar {nova.versao} · {mb(nova.tamanho_bytes)}</Text>
        </Pressable>
        <Text className="text-xs text-ink-subtle text-center mt-4">
          Depois do download, abra o arquivo e toque em Instalar. Não precisa desinstalar.
        </Text>
      </View>
    )
  }

  return (
    <View
      className="absolute left-0 right-0 bottom-0 bg-surface-card border-t border-surface-border px-4 pt-3 flex-row items-center gap-3"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink">Nova versão {nova.versao} disponível</Text>
        <Text className="text-xs text-ink-muted" numberOfLines={1}>
          {nova.notas ? nova.notas.split('\n')[0] : `Você está na ${VERSAO_APP}`} · {mb(nova.tamanho_bytes)}
        </Text>
      </View>
      <Pressable onPress={abrir} className="bg-zinc-900 dark:bg-zinc-100 rounded-xl px-4 min-h-[44px] items-center justify-center">
        <Text className="text-white dark:text-zinc-900 text-sm font-semibold">Atualizar</Text>
      </Pressable>
      <Pressable onPress={() => setFechada(nova.versao)} hitSlop={8} className="min-h-[44px] min-w-[32px] items-center justify-center">
        <Text className="text-ink-subtle text-lg">×</Text>
      </Pressable>
    </View>
  )
}
