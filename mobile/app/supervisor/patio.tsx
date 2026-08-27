import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
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

type Conferente = { id: number; username: string; first_name: string; last_name: string }
type Paginado = { count: number; next: string | null; results: Pedido[] }

export default function SupervisorPatio() {
  const insets = useSafeAreaInsets()
  const dialog = useDialog()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [conferentes, setConferentes] = useState<Conferente[]>([])
  const [conferenteId, setConferenteId] = useState<number | null>(null)
  const [pickerAberto, setPickerAberto] = useState(false)
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
      const data: Paginado | Pedido[] = await supervisorApi.listarSelecionados({ search, page })
      if (Array.isArray(data)) {
        setPedidos(data); setCount(data.length); setProximaPagina(null)
      } else {
        setPedidos((prev) => {
          if (!append) return data.results
          const vistos = new Set(prev.map((p) => p.id))
          return [...prev, ...data.results.filter((p) => !vistos.has(p.id))]
        })
        setCount(data.count); setProximaPagina(data.next ? page + 1 : null)
      }
    } finally {
      setCarregando(false); setCarregandoMais(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const seps: Conferente[] = await supervisorApi.listarConferentes()
      setConferentes(seps)
      if (seps.length > 0) setConferenteId(seps[0].id)
      await carregar('', 1, false)
    })()
  }, [carregar])

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

  async function atribuir() {
    if (selecionados.size === 0 || !conferenteId) return
    setEnviando(true)
    try {
      const ids = Array.from(selecionados)
      const res = await supervisorApi.atribuir(ids, conferenteId)
      setSelecionados(new Set())
      await dialog.alert({
        variant: 'success',
        title: 'Pedidos atribuídos',
        message: `${res.atribuidos.length} pedido(s) atribuído(s) a ${res.conferente}.`,
      })
      await carregar(buscaAtivaRef.current, 1, false)
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro ao atribuir',
        message: 'Não foi possível atribuir os pedidos. Tente novamente.',
      })
    } finally {
      setEnviando(false)
    }
  }

  const sepAtual = conferentes.find((s) => s.id === conferenteId)
  const labelSep = sepAtual
    ? (sepAtual.first_name || sepAtual.last_name)
      ? `${sepAtual.first_name} ${sepAtual.last_name}`.trim()
      : sepAtual.username
    : 'Selecionar conferente'

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Sup. Pátio" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2 gap-2">
        <Text className="text-sm text-ink-muted">
          Atribua pedidos selecionados a um conferente
        </Text>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por número ou cliente"
          placeholderTextColor="#52525b"
          className="h-11 px-3 bg-surface-card border border-surface-border rounded-lg text-ink"
        />
        <Pressable
          onPress={() => setPickerAberto(true)}
          className="h-11 px-3 bg-surface-card border border-surface-border rounded-lg flex-row items-center justify-between"
        >
          <Text className="text-ink" numberOfLines={1}>{labelSep}</Text>
          <Text className="text-ink-subtle">▾</Text>
        </Pressable>
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
            <Text className="text-xs text-ink-subtle mb-2">{pedidos.length} de {count}</Text>
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center py-12">Nenhum pedido aguardando atribuição.</Text>
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
                    ? 'bg-amber-500/15 border-amber-500/40'
                    : 'bg-surface-card border-surface-border active:bg-surface-elev'
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <View className={`w-6 h-6 rounded border-2 items-center justify-center ${
                    marcado ? 'border-amber-400 bg-amber-500' : 'border-ink-subtle'
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
          <Text className="text-sm text-ink-muted flex-1" numberOfLines={1}>
            {selecionados.size} → <Text className="text-ink font-bold">{sepAtual?.username ?? '—'}</Text>
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => setSelecionados(new Set())}
              className="px-3 h-11 items-center justify-center"
            >
              <Text className="text-sm text-ink-muted">Limpar</Text>
            </Pressable>
            <Pressable
              onPress={atribuir}
              disabled={enviando || !conferenteId}
              className="bg-amber-500 active:bg-amber-400 px-5 h-11 rounded-lg items-center justify-center"
            >
              <Text className="text-white font-semibold text-sm">
                {enviando ? 'Atribuindo…' : 'Atribuir'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Picker de conferente */}
      <Modal visible={pickerAberto} animationType="slide" transparent onRequestClose={() => setPickerAberto(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setPickerAberto(false)}>
          <Pressable
            className="bg-surface-card border-t border-surface-border rounded-t-2xl p-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16), maxHeight: '70%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="font-bold text-lg text-ink mb-3">Escolher conferente</Text>
            <FlatList
              data={conferentes}
              keyExtractor={(s) => String(s.id)}
              ItemSeparatorComponent={() => <View className="h-px bg-surface-border" />}
              renderItem={({ item: s }) => {
                const ativo = s.id === conferenteId
                const nome = (s.first_name || s.last_name) ? `${s.first_name} ${s.last_name}`.trim() : s.username
                return (
                  <Pressable
                    onPress={() => { setConferenteId(s.id); setPickerAberto(false) }}
                    className={`px-3 py-3 rounded-lg ${ativo ? 'bg-blue-500/15' : 'active:bg-surface-elev'}`}
                  >
                    <Text className={`text-base font-medium ${ativo ? 'text-blue-300' : 'text-ink'}`}>
                      {nome}
                    </Text>
                    <Text className="text-xs text-ink-subtle">{s.username}</Text>
                  </Pressable>
                )
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
