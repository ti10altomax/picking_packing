import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { useDialog } from '@/components/Dialog'
import { DocBadges } from '@/components/DocBadges'
import { CabecalhoLista } from '@/components/CabecalhoLista'
import { supervisorApi, sequenciasApi, SequenciaResumo } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  qtd_itens: number
  tempo_espera: string
}

type Paginado = { count: number; next: string | null; results: Pedido[] }

const STATUS_SEQ: Record<string, { label: string; cor: string; texto: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-orange-500/15', texto: 'text-orange-300' },
  em_andamento: { label: 'Em andamento', cor: 'bg-blue-500/15', texto: 'text-blue-300' },
  concluida: { label: 'Concluída', cor: 'bg-emerald-500/15', texto: 'text-emerald-300' },
}

export default function SupervisorPatio() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const dialog = useDialog()
  const [sequencias, setSequencias] = useState<SequenciaResumo[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [destino, setDestino] = useState<'nova' | number>('nova')
  const [pickerAberto, setPickerAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaAtivaRef = useRef('')

  const carregarSequencias = useCallback(async () => {
    try {
      setSequencias(await sequenciasApi.listar())
    } catch {
      /* secundário */
    }
  }, [])

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1 && !append) setCarregando(true)
    else setCarregandoMais(true)
    buscaAtivaRef.current = search
    try {
      const data: Paginado | Pedido[] = await supervisorApi.listarSelecionados({
        search, page, sem_sequencia: '1',
      })
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
      await Promise.all([carregarSequencias(), carregar('', 1, false)])
    })()
  }, [carregar, carregarSequencias])

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

  async function enviarParaSequencia() {
    if (selecionados.size === 0) return
    setEnviando(true)
    const ids = Array.from(selecionados)
    try {
      if (destino === 'nova') {
        const seq = await sequenciasApi.criar(ids)
        setSelecionados(new Set())
        router.push(`/supervisor/sequencia/${seq.id}` as never)
        return
      }
      const res = await sequenciasApi.adicionar(destino, ids)
      setSelecionados(new Set())
      await dialog.alert({
        variant: 'success',
        title: 'Pedidos adicionados',
        message: `${res.adicionados.length} pedido(s) entraram na sequência.`,
      })
      await Promise.all([carregarSequencias(), carregar(buscaAtivaRef.current, 1, false)])
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: 'Não foi possível montar a sequência.',
      })
    } finally {
      setEnviando(false)
    }
  }

  const sequenciasAbertas = sequencias.filter((s) => s.status !== 'concluida')
  const labelDestino = destino === 'nova'
    ? 'Nova sequência'
    : `Sequência ${sequenciasAbertas.find((s) => s.id === destino)?.numero ?? destino}`

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Sup. Pátio" />
      <SupervisorNav />

      {/* Sequências em aberto */}
      <View className="pt-3">
        <Text className="px-4 text-sm font-semibold text-ink mb-2">Sequências</Text>
        {sequenciasAbertas.length === 0 ? (
          <Text className="px-4 text-xs text-ink-subtle mb-2">
            Nenhuma sequência em aberto — selecione pedidos e crie a primeira.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            style={{ flexGrow: 0 }}
          >
            {sequenciasAbertas.map((s) => {
              const st = STATUS_SEQ[s.status] ?? STATUS_SEQ.aberta
              return (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/supervisor/sequencia/${s.id}` as never)}
                  className="bg-surface-card border border-surface-border rounded-xl p-3 w-52 active:bg-surface-elev"
                >
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="font-bold text-ink">Seq. {s.numero}</Text>
                    <View className={`px-2 py-0.5 rounded-full ${st.cor}`}>
                      <Text className={`text-xs font-medium ${st.texto}`}>{st.label}</Text>
                    </View>
                  </View>
                  <Text className="text-xs text-ink-muted">
                    {s.qtd_pedidos} pedido(s) · {s.qtd_sem_conferente} sem conf. · {s.qtd_finalizados} final.
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>

      <View className="px-4 pt-3 pb-2 gap-2">
        <Text className="text-sm font-semibold text-ink">Pedidos aguardando sequência</Text>
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
          style={{ opacity: carregando ? 0.45 : 1 }}
          pointerEvents={carregando ? 'none' : 'auto'}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: selecionados.size > 0 ? insets.bottom + 80 : insets.bottom + 16,
            gap: 6,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                carregarSequencias()
                carregar(buscaAtivaRef.current, 1, false)
              }}
              tintColor="#a1a1aa"
            />
          }
          ListHeaderComponent={
            <CabecalhoLista carregando={carregando} exibidos={pedidos.length} total={count} />
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center py-12">Nenhum pedido aguardando sequência.</Text>
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
                      <DocBadges tipo={p.tipo} frete={p.frete} />
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
          className="bg-surface-card border-t border-surface-border flex-row items-center justify-between gap-2"
        >
          <Pressable
            onPress={() => setPickerAberto(true)}
            className="flex-1 h-11 px-3 bg-surface-elev border border-surface-border rounded-lg flex-row items-center justify-between"
          >
            <Text className="text-ink text-sm" numberOfLines={1}>
              {selecionados.size} → {labelDestino}
            </Text>
            <Text className="text-ink-subtle">▾</Text>
          </Pressable>
          <Pressable
            onPress={enviarParaSequencia}
            disabled={enviando}
            className="bg-amber-500 active:bg-amber-400 px-4 h-11 rounded-lg items-center justify-center"
          >
            <Text className="text-white font-semibold text-sm">
              {enviando ? '…' : destino === 'nova' ? 'Criar' : 'Adicionar'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Picker de destino */}
      <Modal visible={pickerAberto} animationType="slide" transparent onRequestClose={() => setPickerAberto(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setPickerAberto(false)}>
          <Pressable
            className="bg-surface-card border-t border-surface-border rounded-t-2xl p-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16), maxHeight: '70%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="font-bold text-lg text-ink mb-3">Enviar para…</Text>
            <Pressable
              onPress={() => { setDestino('nova'); setPickerAberto(false) }}
              className={`px-3 py-3 rounded-lg ${destino === 'nova' ? 'bg-blue-500/15' : 'active:bg-surface-elev'}`}
            >
              <Text className={`text-base font-medium ${destino === 'nova' ? 'text-blue-300' : 'text-ink'}`}>
                Nova sequência
              </Text>
            </Pressable>
            {sequenciasAbertas.map((s) => {
              const ativo = destino === s.id
              return (
                <Pressable
                  key={s.id}
                  onPress={() => { setDestino(s.id); setPickerAberto(false) }}
                  className={`px-3 py-3 rounded-lg ${ativo ? 'bg-blue-500/15' : 'active:bg-surface-elev'}`}
                >
                  <Text className={`text-base font-medium ${ativo ? 'text-blue-300' : 'text-ink'}`}>
                    Sequência {s.numero}
                  </Text>
                  <Text className="text-xs text-ink-subtle">
                    {s.qtd_pedidos} pedido(s) · {s.qtd_sem_conferente} sem conferente
                  </Text>
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
