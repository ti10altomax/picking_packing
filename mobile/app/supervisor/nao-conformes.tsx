import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { useDialog } from '@/components/Dialog'
import { supervisorApi } from '@/lib/api'

type NaoConforme = {
  id: number
  pedido_id: number
  pedido_numero_externo: string
  pedido_cliente: string
  conferente_username: string | null
  motivo: string
  detalhe: string
  status: 'aberto' | 'cancelado' | 'retornado'
  criado_em: string
  resolvido_em: string | null
}

const MOTIVOS: Record<string, string> = {
  produto_avariado: 'Produto avariado',
  produto_em_falta: 'Produto em falta',
  endereco_incorreto: 'Endereço incorreto',
  outro: 'Outro',
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function NaoConformes() {
  const insets = useSafeAreaInsets()
  const dialog = useDialog()
  const [lista, setLista] = useState<NaoConforme[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [acaoEm, setAcaoEm] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try {
      const data = await supervisorApi.listarNaoConformes()
      setLista(Array.isArray(data) ? data : data.results ?? [])
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function cancelar(nc: NaoConforme) {
    const ok = await dialog.confirm({
      variant: 'danger',
      title: 'Cancelar pedido?',
      message: `O pedido ${nc.pedido_numero_externo} será cancelado definitivamente e não voltará para a fila.`,
      confirmText: 'Cancelar pedido',
      cancelText: 'Voltar',
    })
    if (!ok) return
    setAcaoEm(nc.id)
    try {
      await supervisorApi.cancelarNaoConforme(nc.id)
      await carregar()
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: 'Não foi possível cancelar o pedido.',
      })
    } finally { setAcaoEm(null) }
  }

  async function retornar(nc: NaoConforme) {
    const ok = await dialog.confirm({
      variant: 'info',
      title: 'Retornar para fila?',
      message: `O pedido ${nc.pedido_numero_externo} voltará a ficar pendente de atribuição.`,
      confirmText: 'Retornar',
    })
    if (!ok) return
    setAcaoEm(nc.id)
    try {
      await supervisorApi.retornarNaoConforme(nc.id)
      await carregar()
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: 'Não foi possível retornar o pedido.',
      })
    } finally { setAcaoEm(null) }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Não conformes" />
      <SupervisorNav />

      {carregando && lista.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(nc) => String(nc.id)}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 16,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar() }}
              tintColor="#a1a1aa"
            />
          }
          ListEmptyComponent={
            <View className="py-16 items-center">
              <Text className="text-ink-subtle text-base">✓ Nenhum pedido pendente</Text>
              <Text className="text-ink-subtle text-xs mt-1">Tudo limpo por aqui</Text>
            </View>
          }
          renderItem={({ item: nc }) => {
            const aberto = nc.status === 'aberto'
            const cor =
              nc.status === 'aberto' ? 'border-red-500/40 bg-red-500/10' :
              nc.status === 'cancelado' ? 'border-surface-border bg-surface-card opacity-60' :
              'border-surface-border bg-surface-card opacity-70'

            return (
              <View className={`border rounded-xl p-4 ${cor}`}>
                <View className="flex-row items-start justify-between gap-2 mb-2">
                  <View className="flex-1">
                    <Text className="font-bold text-ink">{nc.pedido_numero_externo}</Text>
                    <Text className="text-sm text-ink-muted" numberOfLines={1}>
                      {nc.pedido_cliente || '—'}
                    </Text>
                  </View>
                  <View className={`px-2 py-1 rounded-full ${
                    nc.status === 'aberto' ? 'bg-red-500/20' :
                    nc.status === 'cancelado' ? 'bg-zinc-500/20' :
                    'bg-emerald-500/20'
                  }`}>
                    <Text className={`text-xs font-bold ${
                      nc.status === 'aberto' ? 'text-red-300' :
                      nc.status === 'cancelado' ? 'text-zinc-400' :
                      'text-emerald-300'
                    }`}>
                      {nc.status === 'aberto' ? 'aberto' :
                       nc.status === 'cancelado' ? 'cancelado' :
                       'retornado'}
                    </Text>
                  </View>
                </View>

                <View className="bg-surface-bg/50 rounded-lg p-3 mb-3">
                  <Text className="text-xs text-ink-subtle mb-0.5">Motivo</Text>
                  <Text className="text-sm font-medium text-ink">
                    {MOTIVOS[nc.motivo] ?? nc.motivo}
                  </Text>
                  {nc.detalhe ? (
                    <>
                      <Text className="text-xs text-ink-subtle mt-2 mb-0.5">Detalhe</Text>
                      <Text className="text-sm text-ink-muted">{nc.detalhe}</Text>
                    </>
                  ) : null}
                </View>

                <Text className="text-xs text-ink-subtle mb-3">
                  Aberto em {formatarData(nc.criado_em)}
                  {nc.conferente_username ? ` por ${nc.conferente_username}` : ''}
                  {nc.resolvido_em ? ` · resolvido em ${formatarData(nc.resolvido_em)}` : ''}
                </Text>

                {aberto ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => cancelar(nc)}
                      disabled={acaoEm === nc.id}
                      className="flex-1 bg-red-500/20 active:bg-red-500/30 border border-red-500/40 rounded-lg py-2.5 items-center"
                    >
                      <Text className="text-red-300 font-semibold text-sm">
                        {acaoEm === nc.id ? '…' : 'Cancelar pedido'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => retornar(nc)}
                      disabled={acaoEm === nc.id}
                      className="flex-1 bg-blue-500 active:bg-blue-400 rounded-lg py-2.5 items-center"
                    >
                      <Text className="text-white font-semibold text-sm">
                        {acaoEm === nc.id ? '…' : 'Retornar à fila'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
