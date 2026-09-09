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
import { DocBadges } from '@/components/DocBadges'
import { CabecalhoLista } from '@/components/CabecalhoLista'
import { supervisorApi, pedidosApi } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  conferido_em: string | null
  conferente_username: string | null
  separado_por_nome: string | null
  separador_nao_identificado: boolean
  qtd_itens: number
  duracao_conferencia: string | null
}

type Item = {
  id: number
  sku: string
  descricao: string
  ean: string
  qtd_pedida: number
  qtd_separada: number
  status: 'ok' | 'cancelado' | 'falta'
}

type Paginado = { count: number; next: string | null; results: Pedido[] }

function formatarData(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function Conferidos() {
  const insets = useSafeAreaInsets()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaAtivaRef = useRef('')

  // Acordeão
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Item[]>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1 && !append) setCarregando(true)
    else setCarregandoMais(true)
    buscaAtivaRef.current = search
    try {
      const data: Paginado | Pedido[] = await supervisorApi.listarConferidos({ search, page })
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

  useEffect(() => { carregar('', 1, false) }, [carregar])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(busca, 1, false), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, carregar])

  async function alternarExpansao(id: number) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!itensCache[id] && !carregandoItens.has(id)) {
      setCarregandoItens((prev) => new Set(prev).add(id))
      try {
        const data = await pedidosApi.buscar(id)
        setItensCache((prev) => ({ ...prev, [id]: data.itens ?? [] }))
      } catch {
        setItensCache((prev) => ({ ...prev, [id]: [] }))
      } finally {
        setCarregandoItens((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Conferidos" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2 gap-2">
        <Text className="text-sm text-ink-muted">Pedidos concluídos pelos conferentes</Text>
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
            paddingBottom: insets.bottom + 16,
            gap: 8,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar(buscaAtivaRef.current, 1, false) }}
              tintColor="#a1a1aa"
            />
          }
          ListHeaderComponent={
            <CabecalhoLista carregando={carregando} exibidos={pedidos.length} total={count} />
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center py-12">Nenhum pedido conferido.</Text>
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
            const aberto = expandidos.has(p.id)
            const itens = itensCache[p.id]
            const carregandoEsse = carregandoItens.has(p.id)
            return (
              <View className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <Pressable
                  onPress={() => alternarExpansao(p.id)}
                  className="px-4 py-3 active:bg-surface-elev"
                >
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="font-bold text-ink">{p.numero_externo}</Text>
                        <DocBadges tipo={p.tipo} frete={p.frete} />
                        <View className="bg-emerald-500/15 px-2 py-0.5 rounded-full">
                          <Text className="text-xs text-emerald-300 font-medium">Conferido</Text>
                        </View>
                      </View>
                      <Text className="text-sm text-ink-muted" numberOfLines={1}>
                        {p.cliente || '—'}
                      </Text>
                      <Text className="text-xs text-ink-subtle mt-1">
                        {p.conferido_em ? `${formatarData(p.conferido_em)} · ` : ''}
                        {p.conferente_username
                          ? <>por <Text className="text-ink">{p.conferente_username}</Text></>
                          : 'sem conferente'}
                        {p.separado_por_nome ? (
                          <>
                            {' · '}separado por{' '}
                            <Text className={p.separador_nao_identificado ? 'text-amber-300' : 'text-ink'}>
                              {p.separado_por_nome}
                            </Text>
                          </>
                        ) : null}
                        {' · '}
                        {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                        {p.duracao_conferencia ? (
                          <> · em <Text className="text-ink">{p.duracao_conferencia}</Text></>
                        ) : null}
                      </Text>
                    </View>
                    <Text className="text-ink-subtle text-base">{aberto ? '▾' : '▸'}</Text>
                  </View>
                </Pressable>

                {aberto ? (
                  <View className="bg-emerald-500/10 border-t border-emerald-500/30 border-l-4 border-l-emerald-500 pl-6 pr-4 py-3 gap-1.5">
                    {carregandoEsse && !itens ? (
                      <Text className="text-xs text-ink-subtle italic">Carregando itens…</Text>
                    ) : !itens || itens.length === 0 ? (
                      <Text className="text-xs text-ink-subtle italic">Sem itens.</Text>
                    ) : (
                      itens.map((it) => {
                        const completo = it.status !== 'ok' || it.qtd_separada >= it.qtd_pedida
                        return (
                          <View
                            key={it.id}
                            className={`p-2 rounded-lg ${
                              it.status === 'cancelado' ? 'bg-surface-elev/60 opacity-60' :
                              it.status === 'falta' ? 'bg-orange-500/10' :
                              'bg-surface-card border border-emerald-500/20'
                            }`}
                          >
                            <View className="flex-row items-start gap-3">
                              <View className="flex-1">
                                <Text className="text-sm text-ink font-medium" numberOfLines={2}>
                                  {it.descricao || it.sku}
                                </Text>
                                <Text className="text-xs text-ink-subtle">
                                  {it.sku}{it.ean ? ` · ${it.ean}` : ''}
                                </Text>
                              </View>
                              {it.status === 'ok' ? (
                                <Text className={`text-sm font-bold ${
                                  completo ? 'text-emerald-400' : 'text-ink'
                                }`}>
                                  {it.qtd_separada}/{it.qtd_pedida}
                                </Text>
                              ) : (
                                <Text className="text-xs text-ink-muted">{it.status}</Text>
                              )}
                            </View>
                          </View>
                        )
                      })
                    )}
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
