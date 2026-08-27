import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { useDialog } from '@/components/Dialog'
import { supervisorApi } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  qtd_itens: number
  tempo_espera: string
}

type Paginado = { count: number; next: string | null; results: Pedido[] }

export default function SupervisorVendas() {
  const insets = useSafeAreaInsets()
  const dialog = useDialog()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaAtivaRef = useRef('')

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1 && !append) setCarregando(true)
    else setCarregandoMais(true)
    buscaAtivaRef.current = search
    try {
      const data: Paginado | Pedido[] = await supervisorApi.listarPendentes({ search, page })
      if (Array.isArray(data)) {
        setPedidos(data); setCount(data.length); setProximaPagina(null)
      } else {
        setPedidos((prev) => {
          if (!append) return data.results
          const vistos = new Set(prev.map((p) => p.id))
          return [...prev, ...data.results.filter((p) => !vistos.has(p.id))]
        })
        setCount(data.count)
        setProximaPagina(data.next ? page + 1 : null)
      }
    } finally {
      setCarregando(false); setCarregandoMais(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar('', 1, false) }, [carregar])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(busca, 1, false), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, carregar])

  function toggle(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function enviar() {
    if (selecionados.size === 0) return
    setEnviando(true)
    try {
      const ids = Array.from(selecionados)
      const res = await supervisorApi.selecionar(ids)
      setSelecionados(new Set())
      await dialog.alert({
        variant: 'success',
        title: 'Pedidos enviados',
        message: `${res.selecionados.length} pedido(s) enviado(s) para conferência${
          res.ignorados.length ? ` · ${res.ignorados.length} ignorado(s)` : ''
        }.`,
      })
      await carregar(buscaAtivaRef.current, 1, false)
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro ao enviar',
        message: 'Não foi possível enviar os pedidos. Tente novamente.',
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Sup. Vendas" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2">
        <Text className="text-sm text-ink-muted mb-2">
          Selecione pedidos pendentes pra enviar à conferência
        </Text>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por número ou cliente"
          placeholderTextColor="#52525b"
          className="h-11 px-3 bg-surface-card border border-surface-border rounded-lg text-ink"
        />
      </View>

      {carregando && pedidos.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: selecionados.size > 0 ? insets.bottom + 80 : insets.bottom + 16,
            gap: 6,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar(buscaAtivaRef.current, 1, false) }}
              tintColor="#a1a1aa"
            />
          }
          ListHeaderComponent={
            <Text className="text-xs text-ink-subtle mb-2">
              {pedidos.length} de {count}
            </Text>
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center py-12">Nenhum pedido pendente.</Text>
          }
          ListFooterComponent={
            proximaPagina ? (
              <Pressable
                onPress={() => carregar(buscaAtivaRef.current, proximaPagina, true)}
                disabled={carregandoMais}
                className="bg-surface-card border border-surface-border rounded-xl py-3 mt-3 items-center"
              >
                <Text className="text-ink text-sm font-medium">
                  {carregandoMais ? 'Carregando…' : `Carregar mais (${count - pedidos.length} restantes)`}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item: p }) => {
            const marcado = selecionados.has(p.id)
            return (
              <Pressable
                onPress={() => toggle(p.id)}
                className={`rounded-xl border px-4 py-3 ${
                  marcado
                    ? 'bg-orange-500/15 border-orange-500/40'
                    : 'bg-surface-card border-surface-border active:bg-surface-elev'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-6 h-6 rounded border-2 items-center justify-center ${
                    marcado ? 'border-orange-400 bg-orange-500' : 'border-ink-subtle'
                  }`}>
                    {marcado ? <Text className="text-white font-bold">✓</Text> : null}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-semibold text-ink">{p.numero_externo}</Text>
                      <Text className="text-xs text-ink-subtle">{p.tempo_espera}</Text>
                    </View>
                    <Text className="text-sm text-ink-muted" numberOfLines={1}>
                      {p.cliente || '—'}
                    </Text>
                  </View>
                  <Text className="text-xs text-ink-muted">
                    {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
              </Pressable>
            )
          }}
        />
      )}

      {selecionados.size > 0 ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
          className="bg-surface-card border-t border-surface-border flex-row items-center justify-between gap-3"
        >
          <Text className="text-sm text-ink-muted">
            {selecionados.size} selecionado(s)
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setSelecionados(new Set())}
              className="px-3 h-11 items-center justify-center"
            >
              <Text className="text-sm text-ink-muted">Limpar</Text>
            </Pressable>
            <Pressable
              onPress={enviar}
              disabled={enviando}
              className="bg-orange-500 active:bg-orange-400 px-5 h-11 rounded-lg items-center justify-center"
            >
              <Text className="text-white font-semibold text-sm">
                {enviando ? 'Enviando…' : 'Enviar conferência'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  )
}
