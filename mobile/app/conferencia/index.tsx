import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Vibration,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Header } from '@/components/Header'
import { DocBadges } from '@/components/DocBadges'
import { CameraScanner } from '@/components/CameraScanner'
import { conferenciaApi } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  status: 'atribuido' | 'conferindo' | 'conferido' | 'nao_conforme'
  qtd_itens: number
  percent_conferido: number
  atribuido_em: string | null
  sequencia: { id: number; numero: number } | null
  transportadora?: string
}

type ListaResposta = {
  sequencia: { id: number; numero: number } | null
  aguardando_sequencia: { id: number; numero: number } | null
  pedidos: Pedido[]
  outras_sequencias_pendentes: number
  sequencia_disponivel: { id: number; numero: number } | null
  disponiveis: Pedido[]
}

// Ponto 4 da diretoria (leitura B): quando o código bipado bate com mais de um documento
type Opcao = {
  id: number; tipo: string; numero_externo: string; codsnf: string; cliente: string
  status: string; status_label: string; conferente: string | null
  sequencia: { id: number; numero: number } | null
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
  const [seqDisponivel, setSeqDisponivel] = useState<{ id: number; numero: number } | null>(null)
  const [disponiveis, setDisponiveis] = useState<Pedido[]>([])

  // Barra de bipagem da nota — mesma barra da tela do pedido: recebe o leitor do TC21
  // (DataWedge em modo teclado + Enter), sem teclado virtual.
  const scanRef = useRef<TextInput>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [scanFlash, setScanFlash] = useState<'erro' | null>(null)
  const [pegando, setPegando] = useState(false)
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null)
  // Celular sem leitor embutido: câmera lê o código de barras do DANFE, ou o teclado
  // abre para digitar o número (no TC21 a barra fica sem teclado, como na tela do pedido).
  const [cameraAberta, setCameraAberta] = useState(false)
  const [tecladoAberto, setTecladoAberto] = useState(false)

  const carregar = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    try {
      const data: ListaResposta = await conferenciaApi.listarAtribuidos()
      setPedidos(data.pedidos)
      setSequencia(data.sequencia)
      setAguardando(data.aguardando_sequencia)
      setOutras(data.outras_sequencias_pendentes)
      setSeqDisponivel(data.sequencia_disponivel ?? null)
      setDisponiveis(data.disponiveis ?? [])
      setLastSync(new Date())
    } catch {
      // mostrar erro depois com Dialog
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  function erroScan(msg: string) {
    setScanFlash('erro')
    setScanMsg(msg)
    setScanValue('')
    Vibration.vibrate(200)
    setTimeout(() => { setScanFlash(null); setScanMsg('') }, 3000)
  }

  const pegar = useCallback(async (body: { codigo?: string; pedido_id?: number }) => {
    if (pegando) return
    setPegando(true)
    try {
      const res = await conferenciaApi.pegarDocumento(body)
      setOpcoes(null)
      setScanValue('')
      router.push(`/conferencia/${res.pedido.id}` as never)
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { resultado?: string; erro?: string; opcoes?: Opcao[] } } })?.response?.data
      if (data?.resultado === 'ambiguo' && data.opcoes) {
        setOpcoes(data.opcoes)
        setScanValue('')
      } else {
        erroScan(data?.erro || 'Erro ao buscar o documento')
      }
    } finally {
      setPegando(false)
    }
  }, [pegando, router])

  function handleScan() {
    const cod = scanValue.trim()
    setTecladoAberto(false)
    if (!cod) return
    pegar({ codigo: cod })
  }

  function abrirTeclado() {
    setTecladoAberto(true)
    // showSoftInputOnFocus é lido no foco: solta e foca de novo com o teclado liberado
    setTimeout(() => { scanRef.current?.blur(); setTimeout(() => scanRef.current?.focus(), 50) }, 0)
  }

  useEffect(() => {
    const t = setTimeout(() => scanRef.current?.focus(), 300)
    return () => clearTimeout(t)
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

      {/* Bipar a nota para pegar (ou abrir) o pedido — ponto 4 da diretoria */}
      <View
        className={`mx-4 mb-2 rounded-xl border-2 h-14 flex-row items-center pl-3 pr-1 ${
          scanFlash === 'erro' ? 'border-red-500 bg-red-500/15' : 'border-zinc-700 bg-zinc-900'
        }`}
      >
        <Text className={`text-lg mr-2 ${scanFlash === 'erro' ? 'text-red-400' : 'text-zinc-400'}`}>⌥</Text>
        <TextInput
          ref={scanRef}
          value={scanValue}
          onChangeText={setScanValue}
          onSubmitEditing={handleScan}
          submitBehavior="submit"
          showSoftInputOnFocus={tecladoAberto}
          keyboardType="number-pad"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          placeholder={scanMsg || (tecladoAberto ? 'Digite o número da nota…' : 'Bipe a nota para pegar…')}
          placeholderTextColor={scanFlash === 'erro' ? '#f87171' : '#71717a'}
          onBlur={() => { if (!opcoes && !cameraAberta && !tecladoAberto) setTimeout(() => scanRef.current?.focus(), 80) }}
          className={`flex-1 h-14 text-base font-mono tracking-wider ${scanFlash === 'erro' ? 'text-red-300' : 'text-white'}`}
        />
        <Pressable
          onPress={abrirTeclado}
          className="w-11 h-12 items-center justify-center rounded-lg active:bg-zinc-800"
          accessibilityLabel="Digitar o número"
        >
          <Text className={`text-xl ${tecladoAberto ? 'text-white' : 'text-zinc-400'}`}>⌨</Text>
        </Pressable>
        <Pressable
          onPress={() => { setTecladoAberto(false); setCameraAberta(true) }}
          className="w-12 h-12 items-center justify-center rounded-lg active:bg-zinc-800"
          accessibilityLabel="Bipar com a câmera"
        >
          <Text className={`text-xl ${scanFlash === 'erro' ? 'text-red-400' : 'text-emerald-400'}`}>📷</Text>
        </Pressable>
      </View>

      {cameraAberta ? (
        <CameraScanner
          onResultado={(c) => { setCameraAberta(false); pegar({ codigo: c }) }}
          onFechar={() => { setCameraAberta(false); setTimeout(() => scanRef.current?.focus(), 150) }}
        />
      ) : null}

      {opcoes ? (
        <View className="mx-4 mb-2 bg-surface-card border border-amber-500/60 rounded-xl p-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-sm font-semibold text-ink flex-1">Mais de um documento com esse número — qual é?</Text>
            <Pressable onPress={() => { setOpcoes(null); scanRef.current?.focus() }} className="h-9 px-2 justify-center">
              <Text className="text-sm text-ink-muted">Cancelar</Text>
            </Pressable>
          </View>
          {opcoes.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => pegar({ pedido_id: o.id })}
              className="bg-surface-elev border border-surface-border rounded-lg px-3 py-2 mb-2 active:border-blue-400"
            >
              <View className="flex-row items-center gap-2 flex-wrap">
                <Text className="font-semibold text-ink">{o.numero_externo}</Text>
                <DocBadges tipo={o.tipo} />
                {o.codsnf ? <Text className="text-xs text-ink-subtle">série {o.codsnf}</Text> : null}
                <Text className="text-xs text-ink-muted">
                  {o.status_label}{o.conferente ? ` · ${o.conferente}` : ''}{o.sequencia ? ` · seq. ${o.sequencia.numero}` : ''}
                </Text>
              </View>
              <Text className="text-sm text-ink-muted" numberOfLines={1}>{o.cliente || '—'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
            ) : disponiveis.length === 0 ? (
              <View className="py-20 items-center">
                <Text className="text-ink-subtle">Nenhum pedido atribuído.</Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            seqDisponivel && disponiveis.length > 0 ? (
              <View className="pt-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">
                  Disponíveis na sequência {seqDisponivel.numero} · {disponiveis.length} · bipe a nota ou toque para pegar
                </Text>
                {disponiveis.map((p) => (
                  <Pressable
                    key={`d-${p.id}`}
                    onPress={() => pegar({ pedido_id: p.id })}
                    disabled={pegando}
                    className="bg-surface-card border border-dashed border-surface-border rounded-xl p-3 mb-2 active:border-amber-400"
                  >
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="font-semibold text-ink">{p.numero_externo}</Text>
                      <DocBadges tipo={p.tipo} frete={p.frete} />
                      <Text className="text-xs text-ink-subtle">{p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}</Text>
                    </View>
                    <Text className="text-sm text-ink-muted" numberOfLines={1}>{p.cliente || '—'}</Text>
                    {p.transportadora ? <Text className="text-xs text-ink-subtle" numberOfLines={1}>{p.transportadora}</Text> : null}
                  </Pressable>
                ))}
              </View>
            ) : null
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
                    <DocBadges tipo={p.tipo} frete={p.frete} />
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
