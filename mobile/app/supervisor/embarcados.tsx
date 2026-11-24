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
import { OndeEsta } from '@/components/OndeEsta'
import { CabecalhoLista } from '@/components/CabecalhoLista'
import { ItensPorVolume, type ItemDoc, type VolumeDoc } from '@/components/ItensPorVolume'
import { supervisorApi, pedidosApi } from '@/lib/api'

/**
 * Embarcados (2026-11-24): documentos cuja nota entrou num embarque do Senior. Só consulta —
 * o servidor muda a situação sozinho. A lista vem ordenada por saída/embarque; a linha do
 * caminhão aparece quando o embarque muda. Reimpressão e Corrigir NF ficam no web.
 */
type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  pedidos_origem?: string[]
  nfs_documento?: string[]
  cliente: string
  conferido_em: string | null
  conferente_username: string | null
  qtd_itens: number
  transportadora?: string
  nf_numero?: string
  embarque_numero: string
  embarque_placa: string
  embarque_motorista: string
  embarcado_em: string | null
  status_anterior: string
}

type Detalhe = { itens: ItemDoc[]; volumes: VolumeDoc[] }
type Paginado = { count: number; next: string | null; results: Pedido[] }
type Filtro = '' | 'com' | 'sem'

function formatarData(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Embarcados() {
  const insets = useSafeAreaInsets()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const filtroRef = useRef<Filtro>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaAtivaRef = useRef('')

  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Detalhe>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1 && !append) setCarregando(true)
    else setCarregandoMais(true)
    buscaAtivaRef.current = search
    try {
      const data: Paginado | Pedido[] = await supervisorApi.listarEmbarcados({
        search, page, conferencia: filtroRef.current || undefined,
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
    filtroRef.current = filtro
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(busca, 1, false), busca ? 300 : 0)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, filtro, carregar])

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
        setItensCache((prev) => ({ ...prev, [id]: { itens: data.itens ?? [], volumes: data.volumes ?? [] } }))
      } catch {
        setItensCache((prev) => ({ ...prev, [id]: { itens: [], volumes: [] } }))
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
      <Header title="Embarcados" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2 gap-2">
        <Text className="text-sm text-ink-muted">Notas que já saíram num embarque do Senior</Text>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Nota, pedido, cliente, embarque ou placa"
          placeholderTextColor="#52525b"
          className="h-11 px-3 bg-surface-card border border-surface-border rounded-lg text-ink"
        />
        <View className="flex-row self-start rounded-lg border border-surface-border overflow-hidden">
          {([['', 'Todos'], ['com', 'Conferidos'], ['sem', 'Sem conferência']] as [Filtro, string][]).map(([v, label]) => (
            <Pressable
              key={v}
              onPress={() => setFiltro(v)}
              className={`px-3 h-11 items-center justify-center ${filtro === v ? 'bg-cyan-700' : 'bg-surface-card active:bg-surface-elev'}`}
            >
              <Text className={`text-sm ${filtro === v ? 'text-white font-semibold' : 'text-ink-muted'}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar(buscaAtivaRef.current, 1, false) }}
              tintColor="#a1a1aa"
            />
          }
          ListHeaderComponent={<CabecalhoLista carregando={carregando} exibidos={pedidos.length} total={count} />}
          ListEmptyComponent={
            buscaAtivaRef.current ? (
              <View className="py-4">
                <Text className="text-ink-subtle text-center">Nada encontrado para “{buscaAtivaRef.current}” nesta lista.</Text>
                <OndeEsta busca={buscaAtivaRef.current} lista="embarcados" />
              </View>
            ) : (
              <Text className="text-ink-subtle text-center py-12">
                {filtro ? 'Nenhum documento embarcado com esse filtro.' : 'Nenhum documento embarcado ainda.'}
              </Text>
            )
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
          renderItem={({ item: p, index }) => {
            const aberto = expandidos.has(p.id)
            const detalhe = itensCache[p.id]
            const foiConferido = p.status_anterior === 'conferido'
            const novoEmbarque = index === 0 || pedidos[index - 1].embarque_numero !== p.embarque_numero
            return (
              <View>
                {novoEmbarque ? (
                  <View className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2 mb-2 mt-1">
                    <Text className="text-sm font-bold text-ink">
                      Embarque {p.embarque_numero || '—'}{p.embarque_placa ? ` · ${p.embarque_placa}` : ''}
                    </Text>
                    <Text className="text-xs text-ink-muted">
                      {[p.embarque_motorista, p.embarcado_em ? `saída ${formatarData(p.embarcado_em)}` : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : null}
                <View className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                  <Pressable onPress={() => alternarExpansao(p.id)} className="px-4 py-3 active:bg-surface-elev">
                    <View className="flex-row items-start gap-3">
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className="font-bold text-ink">{p.numero_externo}</Text>
                          <DocBadges tipo={p.tipo} frete={p.frete} origem={p.pedidos_origem} nfs={p.nfs_documento} />
                          {p.tipo === 'pedido' && p.nf_numero ? (
                            <Text className="text-xs text-ink-subtle">NF {p.nf_numero}</Text>
                          ) : null}
                          <View className="bg-cyan-500/15 px-2 py-0.5 rounded-full">
                            <Text className="text-xs text-cyan-300 font-medium">Embarcado</Text>
                          </View>
                          {!foiConferido ? (
                            <View className="bg-amber-500/15 px-2 py-0.5 rounded-full">
                              <Text className="text-xs text-amber-300 font-medium">Sem conferência</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm text-ink-muted" numberOfLines={1}>
                          {p.cliente || '—'}{p.transportadora ? ` · ${p.transportadora}` : ''}
                        </Text>
                        <Text className="text-xs text-ink-subtle mt-1">
                          {foiConferido
                            ? `conferido ${formatarData(p.conferido_em)}${p.conferente_username ? ` por ${p.conferente_username}` : ''}`
                            : p.status_anterior === 'selecionado' ? 'estava na fila do Pátio' : 'estava Pendente em Vendas'}
                          {' · '}{p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                        </Text>
                      </View>
                      <Text className="text-ink-subtle text-base">{aberto ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>
                  {aberto ? (
                    <View className="bg-cyan-500/10 border-t border-cyan-500/30 border-l-4 border-l-cyan-500 pl-6 pr-4 py-3">
                      {carregandoItens.has(p.id) && !detalhe ? (
                        <Text className="text-xs text-ink-subtle italic">Carregando itens…</Text>
                      ) : (
                        <ItensPorVolume itens={detalhe?.itens ?? []} volumes={detalhe?.volumes ?? []} />
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}
