import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { useDialog } from '@/components/Dialog'
import { DocBadges } from '@/components/DocBadges'
import { supervisorApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

// Documento cancelado no Senior (sitPed=5 / sitNfv=9) ou pelo supervisor, que tinha
// conferência em andamento ou concluída. As caixas continuam montadas: o Sup. Pátio
// aponta o documento reemitido e a conferência é transferida sem desmontar nada.
// Paridade com o web (app/(supervisor)/supervisor/cancelados/page.tsx).

type Cancelado = {
  id: number
  tipo: string
  numero_externo: string
  frete?: string
  cliente: string
  cancelado_em: string
  cancelado_origem: 'senior' | 'supervisor' | ''
  status_anterior: string
  status_anterior_label: string
  sequencia: { id: number; numero: number } | null
  conferente: string | null
  separado_por: string | null
  qtd_itens: number
  qtd_volumes: number
  tem_conferencia: boolean
  transferido_para: { id: number; tipo: string; numero_externo: string; status: string } | null
}

type LinhaComparacao = {
  sku: string
  descricao: string
  qtd_origem: number
  qtd_destino: number
  qtd_separada_origem: number
  situacao: 'igual' | 'qtd_diferente' | 'so_na_origem' | 'so_no_destino'
}

type Destino = {
  id: number
  tipo: string
  numero_externo: string
  cliente: string
  status: string
  comparacao: { igual: boolean; itens: LinhaComparacao[] }
}

const SITUACAO_LABEL: Record<LinhaComparacao['situacao'], string> = {
  igual: 'ok',
  qtd_diferente: 'qtd diferente',
  so_na_origem: 'falta no novo',
  so_no_destino: 'só no novo',
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function nomeDoc(tipo: string) {
  return tipo === 'nota_fiscal' ? 'NF' : 'Pedido'
}

export default function Cancelados() {
  const insets = useSafeAreaInsets()
  const dialog = useDialog()
  const { user } = useAuthStore()
  const podeTransferir = user?.perfil === 'supervisor_patio' || user?.perfil === 'admin'

  const [lista, setLista] = useState<Cancelado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [transferindo, setTransferindo] = useState<Cancelado | null>(null)

  const carregar = useCallback(async () => {
    try {
      const data = await supervisorApi.listarCancelados()
      setLista(Array.isArray(data) ? data : [])
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Os que ainda têm o que transferir vêm primeiro (o backend já ordena assim)
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Cancelados" />
      <SupervisorNav />

      {carregando && lista.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(c) => String(c.id)}
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
              <Text className="text-ink-subtle text-base">✓ Nenhum cancelado com conferência</Text>
              <Text className="text-ink-subtle text-xs mt-1">Tudo limpo por aqui</Text>
            </View>
          }
          renderItem={({ item: c }) => {
            const transferido = !!c.transferido_para
            return (
              <View className={`border rounded-xl p-4 ${
                transferido ? 'border-surface-border bg-surface-card opacity-80' : 'border-red-500/40 bg-red-500/10'
              }`}>
                <View className="flex-row items-center gap-2 flex-wrap mb-1">
                  <Text className="font-bold text-ink">{c.numero_externo}</Text>
                  <DocBadges tipo={c.tipo} frete={c.frete} />
                  <View className="px-2 py-0.5 rounded-full bg-surface-elev">
                    <Text className="text-xs font-semibold text-ink-muted">era: {c.status_anterior_label}</Text>
                  </View>
                  <View className="px-2 py-0.5 rounded-full bg-red-500/20">
                    <Text className="text-xs font-bold text-red-300">
                      {c.cancelado_origem === 'senior' ? 'Senior' : 'supervisor'}
                    </Text>
                  </View>
                </View>
                <Text className="text-sm text-ink-muted" numberOfLines={1}>{c.cliente || '—'}</Text>
                <Text className="text-xs text-ink-subtle mt-1">
                  Cancelado em {formatarData(c.cancelado_em)}
                  {c.sequencia ? ` · sequência ${c.sequencia.numero}` : ''}
                  {c.conferente ? ` · conferente: ${c.conferente}` : ''}
                  {c.separado_por ? ` · separado por: ${c.separado_por}` : ''}
                </Text>
                <Text className="text-xs text-ink-subtle mt-1">
                  {c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'} · {c.qtd_volumes} {c.qtd_volumes === 1 ? 'volume' : 'volumes'}
                </Text>

                {c.transferido_para ? (
                  <View className="mt-3 rounded-lg p-3 bg-emerald-500/10">
                    <Text className="text-sm text-emerald-300">
                      Transferido para {nomeDoc(c.transferido_para.tipo)}{' '}
                      <Text className="font-bold">{c.transferido_para.numero_externo}</Text>
                    </Text>
                  </View>
                ) : podeTransferir ? (
                  <Pressable
                    onPress={() => setTransferindo(c)}
                    className="mt-3 bg-blue-500 active:bg-blue-400 rounded-lg py-2.5 items-center"
                  >
                    <Text className="text-white font-semibold text-sm">Transferir conferência…</Text>
                  </Pressable>
                ) : (
                  <Text className="text-xs text-ink-subtle mt-3">Transferência é feita pelo Supervisor de Pátio.</Text>
                )}
              </View>
            )
          }}
        />
      )}

      {transferindo ? (
        <ModalTransferir
          origem={transferindo}
          onFechar={() => setTransferindo(null)}
          onTransferido={async (destino) => {
            setTransferindo(null)
            await carregar()
            await dialog.alert({
              variant: 'info',
              title: 'Conferência transferida',
              message: `${transferindo.numero_externo} → ${nomeDoc(destino.tipo)} ${destino.numero_externo}. O conferente já vê o documento novo na lista dele.`,
            })
          }}
          dialog={dialog}
        />
      ) : null}
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Modal: digita o número do documento reemitido → busca → compara itens → confirma
// -----------------------------------------------------------------------------

function ModalTransferir({
  origem, onFechar, onTransferido, dialog,
}: {
  origem: Cancelado
  onFechar: () => void
  onTransferido: (destino: { id: number; tipo: string; numero_externo: string }) => void
  dialog: ReturnType<typeof useDialog>
}) {
  const insets = useSafeAreaInsets()
  const [busca, setBusca] = useState('')
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState<Destino | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [])

  // Busca com debounce curto; o backend já devolve a comparação de cada candidato
  useEffect(() => {
    const q = busca.trim()
    if (q.length < 2) { setDestinos([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        setDestinos(await supervisorApi.buscarDestinosTransferencia(origem.id, q))
      } catch {
        setDestinos([])
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [busca, origem.id])

  async function confirmar() {
    if (!escolhido) return
    const ok = await dialog.confirm({
      variant: 'info',
      title: 'Transferir conferência?',
      message: `Os ${origem.qtd_volumes} volume(s) e o progresso de ${origem.numero_externo} passam para ${nomeDoc(escolhido.tipo)} ${escolhido.numero_externo}, que assume o status "${origem.status_anterior_label}"${origem.sequencia ? ` na sequência ${origem.sequencia.numero}` : ''}.`,
      confirmText: 'Transferir',
    })
    if (!ok) return
    setEnviando(true)
    setErro('')
    try {
      await supervisorApi.transferirConferencia(origem.id, escolhido.id)
      onTransferido(escolhido)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { erro?: string } } }
      setErro(e?.response?.data?.erro ?? 'Erro ao transferir')
    } finally {
      setEnviando(false)
    }
  }

  const podeConfirmar = !!escolhido && escolhido.comparacao.igual && !enviando
  // Com um candidato escolhido, os outros somem e a comparação fica logo abaixo
  const visiveis = destinos.filter((d) => !escolhido || d.id === escolhido.id)

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View
          className="bg-surface-card rounded-t-2xl"
          style={{ maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="flex-row items-start justify-between p-4 border-b border-surface-border">
            <View className="flex-1">
              <Text className="text-lg font-bold text-ink">Transferir conferência</Text>
              <Text className="text-sm text-ink-muted">
                de <Text className="font-bold">{origem.numero_externo}</Text> ({origem.qtd_volumes} vol.) para o documento reemitido
              </Text>
            </View>
            <Pressable onPress={onFechar} className="w-11 h-11 items-center justify-center">
              <Text className="text-ink-subtle text-2xl">×</Text>
            </Pressable>
          </View>

          <ScrollView className="px-4 pt-3" contentContainerStyle={{ gap: 10, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <TextInput
              ref={inputRef}
              value={busca}
              onChangeText={(v) => { setBusca(v); setEscolhido(null) }}
              placeholder="Número do pedido ou da NF nova…"
              placeholderTextColor="#71717a"
              keyboardType="number-pad"
              className="h-12 px-4 rounded-xl bg-surface-elev text-ink border border-surface-border text-base"
            />

            {buscando ? <Text className="text-xs text-ink-subtle">Buscando…</Text> : null}
            {!buscando && busca.trim().length >= 2 && destinos.length === 0 ? (
              <Text className="text-sm text-ink-subtle">
                Nenhum documento Pendente ou Selecionado com esse número. O sync do Senior roda a cada 2 min —
                se a nota acabou de ser emitida, aguarde e tente de novo.
              </Text>
            ) : null}

            {visiveis.map((d) => {
              const sel = escolhido?.id === d.id
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setEscolhido(sel ? null : d)}
                  className={`p-3 rounded-xl border ${
                    sel ? 'border-blue-500 bg-blue-500/10' : 'border-surface-border bg-surface-elev/40 active:bg-surface-elev'
                  }`}
                >
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="font-bold text-ink">{nomeDoc(d.tipo)} {d.numero_externo}</Text>
                    <Text className="text-xs text-ink-subtle">{d.status === 'pendente' ? 'Pendente' : 'Selecionado'}</Text>
                    <View className={`ml-auto px-2 py-0.5 rounded-full ${d.comparacao.igual ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                      <Text className={`text-xs font-semibold ${d.comparacao.igual ? 'text-emerald-300' : 'text-red-300'}`}>
                        {d.comparacao.igual ? 'itens batem' : 'itens diferentes'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-ink-muted" numberOfLines={1}>{d.cliente || '—'}</Text>
                  {sel ? <Text className="text-xs text-blue-300 mt-1">toque de novo para escolher outro</Text> : null}
                </Pressable>
              )
            })}

            {escolhido ? (
              <View className="rounded-xl border border-surface-border overflow-hidden">
                <View className="flex-row bg-surface-elev px-3 py-2">
                  <Text className="flex-1 text-xs text-ink-subtle uppercase">Item</Text>
                  <Text className="w-14 text-right text-xs text-ink-subtle uppercase">Canc.</Text>
                  <Text className="w-14 text-right text-xs text-ink-subtle uppercase">Novo</Text>
                  <Text className="w-14 text-right text-xs text-ink-subtle uppercase">Conf.</Text>
                </View>
                {escolhido.comparacao.itens.map((l) => (
                  <View
                    key={l.sku}
                    className={`flex-row items-center px-3 py-2 border-t border-surface-border ${l.situacao !== 'igual' ? 'bg-red-500/10' : ''}`}
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-sm text-ink" numberOfLines={2}>{l.descricao || l.sku}</Text>
                      <Text className="text-xs text-ink-subtle">
                        {l.sku}
                        {l.situacao !== 'igual' ? <Text className="text-red-300 font-medium">  {SITUACAO_LABEL[l.situacao]}</Text> : null}
                      </Text>
                    </View>
                    <Text className="w-14 text-right text-sm text-ink">{l.qtd_origem}</Text>
                    <Text className="w-14 text-right text-sm text-ink">{l.qtd_destino}</Text>
                    <Text className="w-14 text-right text-sm text-ink-muted">{l.qtd_separada_origem}</Text>
                  </View>
                ))}
                {!escolhido.comparacao.igual ? (
                  <Text className="px-3 py-2 text-xs text-red-300 bg-red-500/10 border-t border-surface-border">
                    Os itens não batem — a transferência é bloqueada. A nota nova precisa ser conferida do zero.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {!!erro && <Text className="text-sm text-red-400">{erro}</Text>}
          </ScrollView>

          <View className="flex-row gap-2 px-4 pt-3 border-t border-surface-border">
            <Pressable onPress={onFechar} className="flex-1 h-12 rounded-xl bg-surface-elev items-center justify-center">
              <Text className="text-ink font-medium">Voltar</Text>
            </Pressable>
            <Pressable
              onPress={confirmar}
              disabled={!podeConfirmar}
              className={`flex-1 h-12 rounded-xl items-center justify-center ${podeConfirmar ? 'bg-blue-500 active:bg-blue-400' : 'bg-blue-500/40'}`}
            >
              <Text className="text-white font-bold">{enviando ? 'Transferindo…' : 'Transferir'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
