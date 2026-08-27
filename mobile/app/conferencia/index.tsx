import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Header } from '@/components/Header'
import { conferenciaApi } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  status: 'atribuido' | 'conferindo' | 'conferido' | 'nao_conforme'
  qtd_itens: number
  percent_conferido: number
  atribuido_em: string | null
  sequencia: { id: number; numero: number } | null
}

type ListaResposta = {
  sequencia: { id: number; numero: number } | null
  aguardando_sequencia: { id: number; numero: number } | null
  pedidos: Pedido[]
  outras_sequencias_pendentes: number
}

function tempoDesde(iso: string | null): string {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  return `há ${d}d`
}

export default function ConferenciaLista() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [sequencia, setSequencia] = useState<{ id: number; numero: number } | null>(null)
  const [aguardando, setAguardando] = useState<{ id: number; numero: number } | null>(null)
  const [outras, setOutras] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  const carregar = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data: ListaResposta = await conferenciaApi.listarAtribuidos()
      setPedidos(data.pedidos)
      setSequencia(data.sequencia)
      setAguardando(data.aguardando_sequencia)
      setOutras(data.outras_sequencias_pendentes)
      setLastSync(new Date())
    } catch {
      // mostrar erro depois com Dialog
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    // Polling a cada 30s
    const id = setInterval(() => carregar(true), 30_000)
    return () => clearInterval(id)
  }, [carregar])

  const syncLabel = lastSync
    ? lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Atribuídos a mim" />

      <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 flex-1">
          {sequencia ? (
            <View className="px-2 py-0.5 rounded-full bg-blue-500/15">
              <Text className="text-xs font-semibold text-blue-300">Sequência {sequencia.numero}</Text>
            </View>
          ) : null}
          <Text className="text-sm text-ink-subtle" numberOfLines={1}>
            {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
            {outras > 0 ? ` · +${outras} em próximas` : ''}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {syncLabel ? (
            <Text className="text-xs text-ink-subtle">sync {syncLabel}</Text>
          ) : null}
          <Pressable
            onPress={() => carregar(true)}
            disabled={loading || refreshing}
            className="bg-surface-elev px-3 h-9 rounded-lg items-center justify-center"
          >
            <Text className="text-sm text-ink-muted">
              {loading || refreshing ? '…' : '↻'}
            </Text>
          </Pressable>
        </View>
      </View>

      {loading && pedidos.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => carregar(true)}
              tintColor="#a1a1aa"
              colors={['#a1a1aa']}
            />
          }
          ListEmptyComponent={
            aguardando ? (
              <View className="py-20 items-center px-6">
                <Text className="text-ink font-semibold mb-1">Você terminou os seus pedidos 🎉</Text>
                <Text className="text-sm text-ink-subtle text-center">
                  Aguardando a conclusão da sequência {aguardando.numero} para liberar a próxima.
                </Text>
              </View>
            ) : (
              <View className="py-20 items-center">
                <Text className="text-ink-subtle">Nenhum pedido atribuído.</Text>
              </View>
            )
          }
          renderItem={({ item: p }) => (
            <Pressable
              onPress={() => router.push(`/conferencia/${p.id}` as never)}
              className="bg-surface-card border border-surface-border rounded-xl p-4 active:bg-surface-elev"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="font-bold text-ink">{p.numero_externo}</Text>
                    <View
                      className={`px-2 py-0.5 rounded-full ${
                        p.status === 'conferindo'
                          ? 'bg-blue-500/15'
                          : 'bg-amber-500/15'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          p.status === 'conferindo'
                            ? 'text-blue-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {p.status === 'conferindo' ? 'Em conferência' : 'Atribuído'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-ink-muted mt-0.5" numberOfLines={1}>
                    {p.cliente || '—'}
                  </Text>
                  <Text className="text-xs text-ink-subtle mt-1">
                    {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'} · {tempoDesde(p.atribuido_em)}
                  </Text>
                </View>
                {p.status === 'conferindo' ? (
                  <Text className="text-lg font-bold text-blue-400">
                    {p.percent_conferido}%
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}
