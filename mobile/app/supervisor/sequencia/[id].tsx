import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/Toast'
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Header } from '@/components/Header'
import { useDialog } from '@/components/Dialog'
import { DocBadges } from '@/components/DocBadges'
import { ScrollView } from 'react-native'
import {
  supervisorApi, sequenciasApi,
  SequenciaResumo, SequenciaPedido, RelatorioSequencia,
} from '@/lib/api'

type Conferente = { id: number; username: string; first_name: string; last_name: string }
type Detalhe = SequenciaResumo & { pedidos: SequenciaPedido[] }

const STATUS_PEDIDO: Record<string, { label: string; cor: string; texto: string }> = {
  selecionado: { label: 'Sem conferente', cor: 'bg-orange-500/15', texto: 'text-orange-300' },
  atribuido: { label: 'Atribuído', cor: 'bg-amber-500/15', texto: 'text-amber-300' },
  conferindo: { label: 'Em conferência', cor: 'bg-blue-500/15', texto: 'text-blue-300' },
  aguardando_fechamento: { label: 'Aguard. fechamento', cor: 'bg-violet-500/15', texto: 'text-violet-300' },
  conferido: { label: 'Conferido', cor: 'bg-emerald-500/15', texto: 'text-emerald-300' },
  nao_conforme: { label: 'Não conforme', cor: 'bg-red-500/15', texto: 'text-red-300' },
  cancelado: { label: 'Cancelado', cor: 'bg-zinc-500/15', texto: 'text-zinc-400' },
}

const EDITAVEIS = ['selecionado', 'atribuido']

// Filtro local da lista (2026-11-19): a tela já recebe todos os documentos da sequência, e
// com muitas notas ficava difícil achar uma. Busca sem acento por nº, cliente,
// transportadora e conferente; chips de status com contagem.
function semAcento(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
const ORDEM_STATUS = ['selecionado', 'atribuido', 'conferindo', 'aguardando_fechamento', 'conferido', 'nao_conforme', 'cancelado']

export default function SequenciaDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const sequenciaId = Number(id)
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const dialog = useDialog()
  const toast = useToast()

  const [seq, setSeq] = useState<Detalhe | null>(null)
  const [conferentes, setConferentes] = useState<Conferente[]>([])
  const [conferenteId, setConferenteId] = useState<number | null>(null)
  const [pickerAberto, setPickerAberto] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [agindo, setAgindo] = useState(false)
  const [relatorio, setRelatorio] = useState<RelatorioSequencia | null>(null)
  const [relatorioAberto, setRelatorioAberto] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [busca, setBusca] = useState('')

  async function abrirRelatorio() {
    try {
      setRelatorio(await sequenciasApi.relatorio(sequenciaId))
      setRelatorioAberto(true)
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível carregar o relatório.' })
    }
  }

  const carregar = useCallback(async () => {
    try {
      setSeq(await sequenciasApi.detalhe(sequenciaId))
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [sequenciaId])

  useEffect(() => {
    (async () => {
      const lista: Conferente[] = await supervisorApi.listarConferentes()
      setConferentes(lista)
      if (lista.length > 0) setConferenteId(lista[0].id)
      await carregar()
    })()
  }, [carregar])

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
    setAgindo(true)
    try {
      const res = await sequenciasApi.atribuir(sequenciaId, Array.from(selecionados), conferenteId)
      setSelecionados(new Set())
      toast.ok(`${res.atribuidos.length} pedido(s) atribuído(s) a ${res.conferente}`)
      await carregar()
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível atribuir.' })
    } finally {
      setAgindo(false)
    }
  }

  async function remover() {
    if (selecionados.size === 0) return
    const ok = await dialog.confirm({
      variant: 'warning',
      title: 'Remover da sequência?',
      message: `${selecionados.size} pedido(s) voltarão para "aguardando sequência" (atribuições desfeitas).`,
      confirmText: 'Remover',
    })
    if (!ok) return
    setAgindo(true)
    try {
      await sequenciasApi.remover(sequenciaId, Array.from(selecionados))
      setSelecionados(new Set())
      await carregar()
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível remover.' })
    } finally {
      setAgindo(false)
    }
  }

  const sepAtual = conferentes.find((c) => c.id === conferenteId)
  const labelConferente = sepAtual
    ? (sepAtual.first_name || sepAtual.last_name)
      ? `${sepAtual.first_name} ${sepAtual.last_name}`.trim()
      : sepAtual.username
    : 'Escolher conferente'

  if (carregando || !seq) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
        <Header title="Sequência" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      </SafeAreaView>
    )
  }

  const editaveis = seq.pedidos.filter((p) => EDITAVEIS.includes(p.status))
  const porStatus = new Map<string, number>()
  for (const p of seq.pedidos) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1)
  const termo = semAcento(busca.trim())
  const visiveis = seq.pedidos.filter((p) => {
    if (filtroStatus && p.status !== filtroStatus) return false
    if (!termo) return true
    const alvo = semAcento(
      `${p.numero_externo} ${p.cliente ?? ''} ${p.transportadora ?? ''} ${p.conferente_username ?? ''} ${p.pedidos_origem ?? ''}`,
    )
    return alvo.includes(termo)
  })
  const filtrando = !!filtroStatus || !!termo

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title={seq.descricao ? `Seq. ${seq.numero} · ${seq.descricao}` : `Sequência ${seq.numero}`} />

      <View className="px-4 pt-3 pb-2 gap-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-ink-muted">
            {seq.qtd_pedidos} pedido(s) · {seq.qtd_sem_conferente} sem conf. · {seq.qtd_finalizados} final.
          </Text>
          <View className="flex-row items-center gap-2">
            <Pressable onPress={abrirRelatorio} className="px-2 py-1">
              <Text className="text-sm text-blue-400">Relatório</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} className="px-2 py-1">
              <Text className="text-sm text-blue-400">← Voltar</Text>
            </Pressable>
          </View>
        </View>
        {seq.status !== 'concluida' && (
          <Pressable
            onPress={() => setPickerAberto(true)}
            className="h-11 px-3 bg-surface-card border border-surface-border rounded-lg flex-row items-center justify-between"
          >
            <Text className="text-ink" numberOfLines={1}>Atribuir a: {labelConferente}</Text>
            <Text className="text-ink-subtle">▾</Text>
          </Pressable>
        )}
        {seq.pedidos.length > 0 ? (
          <>
            <View className="h-11 bg-surface-card border border-surface-border rounded-lg flex-row items-center pl-3 pr-1">
              <TextInput
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar nº, cliente, transportadora…"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                className="flex-1 text-ink text-sm"
              />
              {busca ? (
                <Pressable onPress={() => setBusca('')} hitSlop={8} className="w-9 h-9 items-center justify-center">
                  <Text className="text-ink-subtle text-lg">×</Text>
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Pressable
                onPress={() => setFiltroStatus('')}
                className={`h-9 px-3 rounded-full border items-center justify-center ${
                  !filtroStatus ? 'bg-zinc-100 border-zinc-100' : 'border-surface-border'
                }`}
              >
                <Text className={`text-xs font-medium ${!filtroStatus ? 'text-zinc-900' : 'text-ink-muted'}`}>Todos · {seq.pedidos.length}</Text>
              </Pressable>
              {ORDEM_STATUS.filter((s) => porStatus.has(s)).map((s) => {
                const cfg = STATUS_PEDIDO[s]
                const ativo = filtroStatus === s
                return (
                  <Pressable
                    key={s}
                    onPress={() => setFiltroStatus(ativo ? '' : s)}
                    className={`h-9 px-3 rounded-full border items-center justify-center ${
                      ativo ? `${cfg.cor} border-transparent` : 'border-surface-border'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${ativo ? cfg.texto : 'text-ink-muted'}`}>{cfg.label} · {porStatus.get(s)}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            {filtrando ? (
              <Text className="text-xs text-ink-subtle">{visiveis.length} de {seq.pedidos.length}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <FlatList
        data={visiveis}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: selecionados.size > 0 ? insets.bottom + 80 : insets.bottom + 16,
          gap: 6,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); carregar() }}
            tintColor="#a1a1aa"
          />
        }
        ListEmptyComponent={
          <Text className="text-ink-subtle text-center py-12">
            {seq.pedidos.length === 0 ? 'Sequência vazia — adicione pedidos pela tela do Pátio.' : 'Nenhum documento com esse filtro.'}
          </Text>
        }
        renderItem={({ item: p }) => {
          const cfg = STATUS_PEDIDO[p.status] ?? { label: p.status, cor: 'bg-surface-elev', texto: 'text-ink-muted' }
          const editavel = EDITAVEIS.includes(p.status) && seq.status !== 'concluida'
          const marcado = selecionados.has(p.id)
          return (
            <Pressable
              onPress={() => editavel && toggle(p.id)}
              className={`rounded-xl border px-4 py-3 ${
                marcado
                  ? 'bg-amber-500/15 border-amber-500/40'
                  : `bg-surface-card border-surface-border ${editavel ? 'active:bg-surface-elev' : 'opacity-75'}`
              }`}
            >
              <View className="flex-row items-center gap-3">
                {editavel ? (
                  <View className={`w-6 h-6 rounded border-2 items-center justify-center ${
                    marcado ? 'border-amber-400 bg-amber-500' : 'border-ink-subtle'
                  }`}>
                    {marcado ? <Text className="text-white font-bold">✓</Text> : null}
                  </View>
                ) : (
                  <View className="w-6" />
                )}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="font-semibold text-ink">{p.numero_externo}</Text>
                    <DocBadges tipo={p.tipo} frete={p.frete} origem={p.pedidos_origem} />
                    <View className={`px-2 py-0.5 rounded-full ${cfg.cor}`}>
                      <Text className={`text-xs font-medium ${cfg.texto}`}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text className="text-sm text-ink-muted" numberOfLines={1}>{p.cliente || '—'}</Text>
                  {p.transportadora ? (
                    <Text className="text-xs text-ink-subtle" numberOfLines={1}>{p.transportadora}</Text>
                  ) : null}
                </View>
                <View className="items-end">
                  {p.conferente_username ? (
                    <Text className="text-xs font-medium text-ink">{p.conferente_username}</Text>
                  ) : null}
                  <Text className="text-xs text-ink-muted">
                    {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
              </View>
            </Pressable>
          )
        }}
      />

      {editaveis.length > 0 && selecionados.size > 0 ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
          className="bg-surface-card border-t border-surface-border flex-row items-center justify-between gap-2"
        >
          <Text className="text-sm text-ink-muted flex-1" numberOfLines={1}>
            {selecionados.size} → <Text className="text-ink font-bold">{sepAtual?.username ?? '—'}</Text>
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={remover}
              disabled={agindo}
              className="px-3 h-11 items-center justify-center"
            >
              <Text className="text-sm text-red-400">Remover</Text>
            </Pressable>
            <Pressable
              onPress={atribuir}
              disabled={agindo || !conferenteId}
              className="bg-amber-500 active:bg-amber-400 px-5 h-11 rounded-lg items-center justify-center"
            >
              <Text className="text-white font-semibold text-sm">
                {agindo ? '…' : 'Atribuir'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Relatório produto × tipo de volume */}
      <Modal visible={relatorioAberto} animationType="slide" transparent onRequestClose={() => setRelatorioAberto(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setRelatorioAberto(false)}>
          <Pressable
            className="bg-surface-card border-t border-surface-border rounded-t-2xl p-4"
            style={{ paddingBottom: Math.max(insets.bottom, 16), maxHeight: '85%' }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="font-bold text-lg text-ink mb-1">
              Relatório — Sequência {relatorio?.sequencia.numero}
            </Text>
            <Text className="text-xs text-ink-subtle mb-3">
              {relatorio
                ? Object.entries(relatorio.volumes).map(([t, n]) => `${n} ${t}(s)`).join(' · ') || 'sem volumes'
                : ''}
            </Text>
            <ScrollView>
              {/* Documentos da sequência — ponto 2 da diretoria (2026-10-01) */}
              <Text className="text-sm font-bold text-ink mb-1">
                Documentos ({relatorio?.documentos.length ?? 0})
              </Text>
              {relatorio?.documentos.map((d) => {
                const vols = [
                  d.volumes.caixa && `${d.volumes.caixa} cx`,
                  d.volumes.fardo && `${d.volumes.fardo} fd`,
                  d.volumes.outro && `${d.volumes.outro} out`,
                ].filter(Boolean).join(' · ') || 'sem volumes'
                return (
                  <View key={d.id} className={`border-b border-surface-border py-2 ${d.status === 'cancelado' ? 'opacity-60' : ''}`}>
                    <View className="flex-row items-center gap-2 flex-wrap">
                      <Text className="text-sm font-bold text-ink">{d.numero_externo}</Text>
                      <DocBadges tipo={d.tipo} frete={d.frete} />
                      <Text className="text-xs text-ink-muted">{d.status_label}</Text>
                      <Text className="ml-auto text-sm text-ink">
                        {d.unid_conferidas}<Text className="text-ink-subtle">/{d.unid_pedidas}</Text>
                      </Text>
                    </View>
                    <Text className="text-xs text-ink-muted" numberOfLines={1}>{d.cliente || '—'}</Text>
                    <Text className="text-xs text-ink-subtle">
                      {d.transportadora ? `${d.transportadora} · ` : ''}
                      {vols}
                      {d.conferente ? ` · ${d.conferente}` : ''}
                      {d.separado_por ? ` · sep. ${d.separado_por}` : d.separador_nao_identificado ? ' · sep. não identificado' : ''}
                      {d.transferido_para ? ` · → ${d.transferido_para}` : ''}
                    </Text>
                  </View>
                )
              })}

              <Text className="text-sm font-bold text-ink mt-4 mb-1">Produtos por tipo de volume</Text>
              {relatorio?.linhas.length === 0 ? (
                <Text className="text-ink-subtle text-center py-8">Nenhuma bipagem registrada.</Text>
              ) : (
                relatorio?.linhas.map((l) => (
                  <View key={l.sku} className="border-b border-surface-border py-2">
                    <Text className="text-sm font-medium text-ink" numberOfLines={2}>
                      {l.descricao || l.sku}
                    </Text>
                    <Text className="text-xs text-ink-subtle">{l.sku}</Text>
                    <Text className="text-xs text-ink-muted mt-0.5">
                      caixa {l.caixa} · fardo {l.fardo} · outro {l.outro} ·{' '}
                      <Text className="font-bold text-ink">total {l.total}</Text>
                    </Text>
                  </View>
                ))
              )}
              {relatorio && relatorio.linhas.length > 0 ? (
                <Text className="text-sm font-bold text-ink py-3">
                  Total geral: caixa {relatorio.totais.caixa} · fardo {relatorio.totais.fardo} · outro {relatorio.totais.outro} · {relatorio.totais.total} unid.
                </Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

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
