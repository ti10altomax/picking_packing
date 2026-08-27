import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { conferenciaApi, separadoresApi, SeparadorLiberado } from '@/lib/api'
import { CameraScanner } from '@/components/CameraScanner'
import { useDialog } from '@/components/Dialog'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

type ItemPedido = {
  id: number
  sku: string
  descricao: string
  ean: string
  qtd_pedida: number
  qtd_separada: number
  status: 'ok' | 'cancelado' | 'falta'
}

type VolumeItem = {
  id: number
  pedido_item_id: number
  qtd: number
}

type Volume = {
  id: number
  tipo: 'caixa' | 'fardo' | 'outro'
  identificador: string
  fechado_em: string | null
  itens: VolumeItem[]
}

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  status: 'atribuido' | 'conferindo' | 'conferido' | 'nao_conforme'
  qtd_itens: number
  separado_por: { id: number; nome: string; apelido: string } | null
  separador_nao_identificado: boolean
  itens: ItemPedido[]
  volumes: Volume[]
}

const MOTIVOS = [
  { valor: 'divergencia_qtd', label: 'Divergência de quantidade' },
  { valor: 'produto_errado', label: 'Produto errado' },
  { valor: 'item_ausente', label: 'Item ausente' },
]

// -----------------------------------------------------------------------------
// Tela principal
// -----------------------------------------------------------------------------

export default function ConferenciaDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const pedidoId = Number(id)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const dialog = useDialog()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [modalNovoVolume, setModalNovoVolume] = useState(false)
  const [modalNaoConforme, setModalNaoConforme] = useState(false)
  const [modalConcluir, setModalConcluir] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemPedido | null>(null)
  const [codigoInicial, setCodigoInicial] = useState('')
  const [cameraGlobalAberta, setCameraGlobalAberta] = useState(false)

  // Apontamento "separado por" (DESIGN.md §2)
  const [liberados, setLiberados] = useState<SeparadorLiberado[]>([])
  const [apontamento, setApontamento] = useState<number | 'nao_identificado' | null>(null)
  const [modalSeparadoPor, setModalSeparadoPor] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const data: Pedido = await conferenciaApi.detalhe(pedidoId)
      setPedido(data)
    } catch {
      setErro('Erro ao carregar pedido')
    } finally {
      setLoading(false)
    }
  }, [pedidoId])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Lista de separadores liberados hoje — usada no iniciar e no modal de troca
  useEffect(() => {
    if (pedido?.status === 'atribuido' || modalSeparadoPor) {
      separadoresApi.liberados().then(setLiberados).catch(() => setLiberados([]))
    }
  }, [pedido?.status, modalSeparadoPor])

  const volumes = pedido?.volumes ?? []
  const [ativoIdManual, setAtivoIdManual] = useState<number | null>(null)
  // Volume ativo: o que o conferente escolheu manualmente (se ainda válido),
  // senão fallback pro último volume aberto.
  const volumeAtivo =
    (ativoIdManual !== null
      ? volumes.find((v) => v.id === ativoIdManual && !v.fechado_em)
      : null)
    ?? [...volumes].reverse().find((v) => !v.fechado_em)
    ?? null

  const totalPedido = pedido?.itens.reduce(
    (s, i) => s + (i.status === 'ok' ? i.qtd_pedida : 0), 0,
  ) ?? 0
  const totalConferido = pedido?.itens.reduce(
    (s, i) => s + (i.status === 'ok' ? i.qtd_separada : 0), 0,
  ) ?? 0
  const percent = totalPedido ? Math.round((totalConferido / totalPedido) * 1000) / 10 : 0
  const tudo100 = !!pedido && totalPedido > 0 && totalConferido >= totalPedido

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  async function iniciar() {
    if (apontamento === null) return
    try {
      await conferenciaApi.iniciar(
        pedidoId,
        apontamento === 'nao_identificado'
          ? { nao_identificado: true }
          : { separado_por: apontamento },
      )
      setErro('')
      await carregar()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Erro ao iniciar conferência')
    }
  }

  async function aoAlterarSeparadoPor(valor: number | 'nao_identificado') {
    setModalSeparadoPor(false)
    try {
      await conferenciaApi.alterarSeparadoPor(
        pedidoId,
        valor === 'nao_identificado' ? { nao_identificado: true } : { separado_por: valor },
      )
      await carregar()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Erro ao alterar o apontamento')
    }
  }

  async function aoCriarVolume(tipo: 'caixa' | 'fardo' | 'outro', identificador: string) {
    setModalNovoVolume(false)
    try {
      await conferenciaApi.criarVolume(pedidoId, tipo, identificador)
      await carregar()
    } catch {
      setErro('Erro ao criar volume')
    }
  }

  async function aoConcluir(sobras: { item_id: number; qtd: number }[]) {
    setModalConcluir(false)
    try {
      const res = await conferenciaApi.concluir(pedidoId, sobras)
      if (res.aguardando_fechamento) {
        await dialog.alert({
          variant: 'info',
          title: 'Sobra registrada',
          message: 'O pedido ficou aguardando o fechamento do Supervisor de Pátio.',
        })
      }
      router.replace('/conferencia')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        variant: 'danger',
        title: 'Erro ao concluir',
        message: msg ?? 'Não foi possível concluir a conferência.',
      })
    }
  }

  async function aoMarcarNaoConforme(motivo: string, detalhe: string) {
    setModalNaoConforme(false)
    try {
      await conferenciaApi.marcarNaoConforme(pedidoId, motivo, detalhe)
      router.replace('/conferencia')
    } catch {
      setErro('Erro ao marcar como não conforme')
    }
  }

  async function aoRemoverItem(volumeId: number, volumeItemId: number) {
    if (!pedido) return
    const vi = pedido.volumes
      .find((v) => v.id === volumeId)?.itens
      .find((x) => x.id === volumeItemId)
    const item = vi ? pedido.itens.find((i) => i.id === vi.pedido_item_id) : null
    const desc = item ? (item.descricao || item.sku) : 'item'
    const ok = await dialog.confirm({
      variant: 'warning',
      title: 'Remover lançamento?',
      message: `${desc} (${vi?.qtd}×) sairá deste volume. A quantidade volta pra fila e você pode bipar de novo.`,
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await conferenciaApi.removerVolumeItem(pedidoId, volumeId, volumeItemId)
      await carregar()
    } catch {
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: 'Não foi possível remover o lançamento.',
      })
    }
  }

  async function aoRemoverVolume(volumeId: number) {
    const ok = await dialog.confirm({
      variant: 'danger',
      title: 'Apagar volume?',
      message: 'O volume será apagado. Só permitido se estiver vazio.',
      confirmText: 'Apagar',
    })
    if (!ok) return
    try {
      await conferenciaApi.removerVolume(pedidoId, volumeId)
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: msg ?? 'Não foi possível apagar o volume.',
      })
    }
  }

  // Scanner global da lista — bipou um código, busca o item correspondente
  function processarCodigoLido(cod: string) {
    setCameraGlobalAberta(false)
    if (!pedido) return
    if (!volumeAtivo) {
      setErro('Crie um volume antes de bipar')
      Vibration.vibrate([0, 100, 50, 100])
      return
    }
    const item = pedido.itens.find(
      (i) =>
        i.status === 'ok' &&
        i.qtd_separada < i.qtd_pedida &&
        (i.ean === cod || i.sku === cod),
    )
    if (item) {
      setCodigoInicial(cod)
      setItemSelecionado(item)
    } else {
      setErro(`Código ${cod} não corresponde a nenhum item pendente`)
      Vibration.vibrate([0, 100, 50, 100])
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg items-center justify-center">
        <ActivityIndicator size="large" color="#a1a1aa" />
      </SafeAreaView>
    )
  }

  if (!pedido) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg items-center justify-center px-8">
        <Text className="text-red-400 text-center">{erro || 'Pedido não encontrado.'}</Text>
      </SafeAreaView>
    )
  }

  // Estado: ainda não iniciou conferência
  if (pedido.status === 'atribuido') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
        <CabecalhoSimples pedido={pedido} percent={0} segundos={segundos} onBack={() => router.back()} />
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}
        >
          <Text className="text-lg font-semibold text-ink mb-1 text-center">Pronto para iniciar</Text>
          <Text className="text-sm text-ink-subtle mb-6 text-center">
            {pedido.qtd_itens} {pedido.qtd_itens === 1 ? 'item' : 'itens'} · {totalPedido} unidade(s)
          </Text>

          <Text className="text-sm font-semibold text-ink mb-2">Quem separou este pedido? *</Text>
          <SeletorSeparadoPor liberados={liberados} valor={apontamento} onChange={setApontamento} />

          {!!erro && (
            <Text className="text-sm text-red-400 mt-4 text-center">{erro}</Text>
          )}

          <Pressable
            onPress={iniciar}
            disabled={apontamento === null}
            className={`mt-6 px-8 h-14 rounded-2xl items-center justify-center ${
              apontamento === null ? 'bg-surface-elev' : 'bg-blue-500 active:bg-blue-400'
            }`}
          >
            <Text className={`font-bold text-base ${apontamento === null ? 'text-ink-subtle' : 'text-white'}`}>
              Iniciar conferência
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <CabecalhoSimples pedido={pedido} percent={percent} segundos={segundos} onBack={() => router.back()} />

      {/* Progress bar */}
      <View className="bg-surface-card px-4 pt-2 pb-3 border-b border-surface-border">
        <View className="h-3 bg-surface-elev rounded-full overflow-hidden">
          <View
            className={`h-full rounded-full ${tudo100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </View>
        <Text className="text-xs text-ink-subtle mt-1">
          {totalConferido} / {totalPedido} unidades · {volumes.length} volume(s)
        </Text>
        <View className="flex-row items-center gap-1 mt-0.5">
          <Text className="text-xs text-ink-subtle">
            Separado por:{' '}
            {pedido.separador_nao_identificado ? (
              <Text className="font-semibold text-amber-400">Não identificado</Text>
            ) : pedido.separado_por ? (
              <Text className="font-semibold">{pedido.separado_por.apelido || pedido.separado_por.nome}</Text>
            ) : (
              '—'
            )}
          </Text>
          {pedido.status === 'conferindo' && (
            <Pressable onPress={() => setModalSeparadoPor(true)} className="px-1.5 py-1">
              <Text className="text-xs text-blue-400">trocar</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Volume atual + botão novo volume */}
      <View className="bg-surface-card px-4 py-3 border-b border-surface-border flex-row items-center gap-3">
        <View className="flex-1">
          {volumeAtivo ? (
            <>
              <Text className="text-xs text-ink-subtle uppercase tracking-wide">Volume atual</Text>
              <Text className="font-bold text-base text-ink" numberOfLines={1}>
                {volumeAtivo.identificador || `${tipoLabel(volumeAtivo.tipo)} #${volumeAtivo.id}`}
              </Text>
              <Text className="text-xs text-ink-muted">
                {volumeAtivo.itens.length} bipagem(ns) · {volumeAtivo.itens.reduce((s, i) => s + i.qtd, 0)} unidade(s)
              </Text>
            </>
          ) : (
            <Text className="text-sm text-ink-muted">Nenhum volume aberto — abra um para começar</Text>
          )}
        </View>
        <Pressable
          onPress={() => setModalNovoVolume(true)}
          className="bg-zinc-100 active:bg-zinc-300 px-4 h-12 rounded-xl items-center justify-center"
        >
          <Text className="text-zinc-900 font-semibold text-sm">+ Volume</Text>
        </Pressable>
      </View>

      {/* Botão grande de bipar — abre câmera direto, scanner global */}
      {volumeAtivo ? (
        <Pressable
          onPress={() => setCameraGlobalAberta(true)}
          className="mx-4 mt-3 bg-zinc-900 active:bg-zinc-800 border-2 border-zinc-700 rounded-xl h-14 flex-row items-center justify-center gap-2"
        >
          <Text className="text-2xl">📷</Text>
          <Text className="text-white font-bold text-base">Bipar código de barras</Text>
        </Pressable>
      ) : null}

      {/* Lista de volumes (acordeão) */}
      {volumes.length > 0 && pedido ? (
        <ListaVolumes
          volumes={volumes}
          itens={pedido.itens}
          ativoId={volumeAtivo?.id ?? null}
          permiteEdicao={pedido.status === 'conferindo'}
          onAtivar={setAtivoIdManual}
          onRemoverItem={aoRemoverItem}
          onRemoverVolume={aoRemoverVolume}
        />
      ) : null}

      {/* Erro global */}
      {erro ? (
        <View className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 flex-row items-center justify-between">
          <Text className="text-red-300 text-sm flex-1">{erro}</Text>
          <Pressable onPress={() => setErro('')} className="px-2">
            <Text className="text-red-300">×</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Lista de itens */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 8 }}
      >
        {pedido.itens.map((item) => {
          const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
          const desabilitado = item.status !== 'ok' || completo
          return (
            <Pressable
              key={item.id}
              onPress={() => !desabilitado && volumeAtivo && setItemSelecionado(item)}
              disabled={desabilitado || !volumeAtivo}
              className={`rounded-xl border px-4 py-3 ${
                completo
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : !volumeAtivo
                  ? 'bg-surface-elev border-surface-border opacity-60'
                  : 'bg-surface-card border-surface-border active:bg-surface-elev'
              }`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-medium text-sm text-ink" numberOfLines={2}>
                    {item.descricao || item.sku}
                  </Text>
                  <Text className="text-xs text-ink-subtle mt-0.5">{item.sku}</Text>
                  {item.ean ? (
                    <View className="bg-surface-elev px-2 py-0.5 rounded mt-1 self-start">
                      <Text className="text-sm font-mono text-ink" selectable>{item.ean}</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  className={`text-lg font-bold ${
                    completo ? 'text-emerald-400' : 'text-ink'
                  }`}
                >
                  {completo ? '✓' : `${item.qtd_separada}/${item.qtd_pedida}`}
                </Text>
              </View>
              {item.status === 'ok' && !completo && item.qtd_pedida > 0 ? (
                <View className="mt-2 h-1.5 bg-surface-elev rounded-full overflow-hidden">
                  <View
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${(item.qtd_separada / item.qtd_pedida) * 100}%` }}
                  />
                </View>
              ) : null}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Botões inferiores — paddingBottom respeita a navigation bar do Android */}
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12),
        }}
        className="bg-surface-card border-t border-surface-border flex-row gap-3"
      >
        <Pressable
          onPress={() => setModalNaoConforme(true)}
          className="flex-1 h-12 bg-red-500/10 active:bg-red-500/20 rounded-xl items-center justify-center"
        >
          <Text className="text-red-300 font-medium text-sm">Não conforme</Text>
        </Pressable>
        <Pressable
          onPress={() => setModalConcluir(true)}
          disabled={!tudo100 || volumes.length === 0}
          className={`flex-1 h-12 rounded-xl items-center justify-center ${
            tudo100 && volumes.length > 0
              ? 'bg-emerald-500 active:bg-emerald-400'
              : 'bg-surface-elev'
          }`}
        >
          <Text className={`font-bold text-base ${
            tudo100 && volumes.length > 0 ? 'text-white' : 'text-ink-subtle'
          }`}>
            {tudo100 ? 'Concluir ✓' : `Falta ${totalPedido - totalConferido} unid.`}
          </Text>
        </Pressable>
      </View>

      {/* Modais */}
      {modalNovoVolume ? (
        <ModalNovoVolume
          volumes={volumes}
          onCancelar={() => setModalNovoVolume(false)}
          onConfirmar={aoCriarVolume}
        />
      ) : null}

      {itemSelecionado && volumeAtivo ? (
        <ModalBipar
          item={itemSelecionado}
          volumeId={volumeAtivo.id}
          pedidoId={pedidoId}
          codigoInicial={codigoInicial}
          onFechar={() => { setItemSelecionado(null); setCodigoInicial('') }}
          onSucesso={async () => {
            setItemSelecionado(null)
            setCodigoInicial('')
            await carregar()
          }}
        />
      ) : null}

      {cameraGlobalAberta ? (
        <CameraScanner
          onResultado={processarCodigoLido}
          onFechar={() => setCameraGlobalAberta(false)}
        />
      ) : null}

      {modalNaoConforme ? (
        <ModalNaoConforme
          onCancelar={() => setModalNaoConforme(false)}
          onConfirmar={aoMarcarNaoConforme}
        />
      ) : null}

      {modalConcluir ? (
        <ModalConcluir
          itens={pedido.itens.filter((i) => i.status === 'ok')}
          onCancelar={() => setModalConcluir(false)}
          onConfirmar={aoConcluir}
        />
      ) : null}

      {modalSeparadoPor ? (
        <ModalSeparadoPor
          liberados={liberados}
          atual={pedido.separador_nao_identificado ? 'nao_identificado' : pedido.separado_por?.id ?? null}
          onCancelar={() => setModalSeparadoPor(false)}
          onConfirmar={aoAlterarSeparadoPor}
        />
      ) : null}
    </SafeAreaView>
  )
}

// -----------------------------------------------------------------------------
// Modal — Concluir (com registro opcional de sobras — DESIGN.md §4.2)
// -----------------------------------------------------------------------------

function ModalConcluir({ itens, onCancelar, onConfirmar }: {
  itens: ItemPedido[]
  onCancelar: () => void
  onConfirmar: (sobras: { item_id: number; qtd: number }[]) => void
}) {
  const insets = useSafeAreaInsets()
  const [sobras, setSobras] = useState<{ item_id: number; qtd: number }[]>([])
  const [itemId, setItemId] = useState<number | null>(null)
  const [qtd, setQtd] = useState('1')
  const [pickerAberto, setPickerAberto] = useState(false)

  function adicionarSobra() {
    const q = Number(qtd)
    if (!itemId || q < 1) return
    setSobras((prev) => {
      const existente = prev.find((s) => s.item_id === itemId)
      if (existente) return prev.map((s) => (s.item_id === itemId ? { ...s, qtd: s.qtd + q } : s))
      return [...prev, { item_id: itemId, qtd: q }]
    })
    setItemId(null)
    setQtd('1')
  }

  const nomeItem = (id: number) => {
    const i = itens.find((x) => x.id === id)
    return i ? (i.descricao || i.sku) : `item ${id}`
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancelar}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancelar}>
        <Pressable
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-bold text-lg text-ink mb-1">Concluir conferência</Text>
          <Text className="text-sm text-ink-muted mb-4">Os volumes serão enviados ao Senior.</Text>

          <View className="bg-surface-elev/60 rounded-xl p-3 mb-4">
            <Text className="text-sm font-semibold text-ink mb-2">
              Sobrou mercadoria? (o separador trouxe a mais)
            </Text>

            {sobras.map((s) => (
              <View
                key={s.item_id}
                className="flex-row items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5 mb-1"
              >
                <Text className="text-sm text-ink flex-1" numberOfLines={1}>
                  <Text className="font-bold">{s.qtd}×</Text> {nomeItem(s.item_id)}
                </Text>
                <Pressable onPress={() => setSobras((prev) => prev.filter((x) => x.item_id !== s.item_id))}>
                  <Text className="text-xs text-red-400 px-1">remover</Text>
                </Pressable>
              </View>
            ))}

            <View className="flex-row gap-2 mt-1">
              <Pressable
                onPress={() => setPickerAberto(!pickerAberto)}
                className="flex-1 h-11 px-3 bg-surface-card border border-surface-border rounded-lg flex-row items-center justify-between"
              >
                <Text className="text-ink text-sm flex-1" numberOfLines={1}>
                  {itemId ? nomeItem(itemId) : 'Escolher item…'}
                </Text>
                <Text className="text-ink-subtle">▾</Text>
              </Pressable>
              <TextInput
                value={qtd}
                onChangeText={(t) => setQtd(t.replace(/\D/g, ''))}
                keyboardType="numeric"
                className="w-16 h-11 px-2 bg-surface-card border border-surface-border rounded-lg text-ink text-center"
              />
              <Pressable
                onPress={adicionarSobra}
                disabled={!itemId || !Number(qtd)}
                className={`h-11 px-4 rounded-lg items-center justify-center ${
                  !itemId || !Number(qtd) ? 'bg-surface-elev' : 'bg-amber-500 active:bg-amber-400'
                }`}
              >
                <Text className={`font-bold ${!itemId || !Number(qtd) ? 'text-ink-subtle' : 'text-white'}`}>+</Text>
              </Pressable>
            </View>

            {pickerAberto ? (
              <View className="mt-2 border border-surface-border rounded-lg overflow-hidden" style={{ maxHeight: 220 }}>
                <ScrollView>
                  {itens.map((i) => (
                    <Pressable
                      key={i.id}
                      onPress={() => { setItemId(i.id); setPickerAberto(false) }}
                      className={`px-3 py-2.5 border-b border-surface-border ${
                        itemId === i.id ? 'bg-blue-500/15' : 'active:bg-surface-elev'
                      }`}
                    >
                      <Text className="text-sm text-ink" numberOfLines={2}>{i.descricao || i.sku}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Text className="text-xs text-ink-subtle mt-2">
              Sem sobras, deixe em branco. Com sobras, o fechamento pode ficar com o Sup. Pátio.
            </Text>
          </View>

          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancelar}
              className="flex-1 h-12 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink font-medium">Voltar</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirmar(sobras)}
              className="flex-1 h-12 bg-emerald-600 active:bg-emerald-500 rounded-xl items-center justify-center"
            >
              <Text className="text-white font-bold">Concluir ✓</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Apontamento "separado por" — seletor + modal de troca
// -----------------------------------------------------------------------------

function SeletorSeparadoPor({ liberados, valor, onChange }: {
  liberados: SeparadorLiberado[]
  valor: number | 'nao_identificado' | null
  onChange: (v: number | 'nao_identificado') => void
}) {
  return (
    <View className="gap-2">
      {liberados.length === 0 ? (
        <Text className="text-sm text-ink-subtle bg-surface-elev rounded-xl p-3">
          Nenhum separador liberado hoje — peça ao Supervisor de Pátio.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {liberados.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onChange(s.id)}
              className={`h-12 px-4 rounded-xl border-2 items-center justify-center ${
                valor === s.id
                  ? 'border-blue-500 bg-blue-500/15'
                  : 'border-surface-border bg-surface-card'
              }`}
              style={{ minWidth: '47%' }}
            >
              <Text
                numberOfLines={1}
                className={`text-sm font-semibold ${valor === s.id ? 'text-blue-300' : 'text-ink-muted'}`}
              >
                {s.apelido || s.nome}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        onPress={() => onChange('nao_identificado')}
        className={`h-11 rounded-xl border-2 items-center justify-center ${
          valor === 'nao_identificado'
            ? 'border-amber-500 bg-amber-500/15'
            : 'border-surface-border border-dashed'
        }`}
      >
        <Text className={`text-sm font-semibold ${
          valor === 'nao_identificado' ? 'text-amber-300' : 'text-ink-subtle'
        }`}>
          ⚠ Não identificado
        </Text>
      </Pressable>
    </View>
  )
}

function ModalSeparadoPor({ liberados, atual, onCancelar, onConfirmar }: {
  liberados: SeparadorLiberado[]
  atual: number | 'nao_identificado' | null
  onCancelar: () => void
  onConfirmar: (v: number | 'nao_identificado') => void
}) {
  const insets = useSafeAreaInsets()
  const [valor, setValor] = useState<number | 'nao_identificado' | null>(atual)
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancelar}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancelar}>
        <Pressable
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-bold text-lg text-ink mb-4">Quem separou este pedido?</Text>
          <SeletorSeparadoPor liberados={liberados} valor={valor} onChange={setValor} />
          <View className="flex-row gap-3 mt-5">
            <Pressable
              onPress={onCancelar}
              className="flex-1 h-12 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink font-medium">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => valor !== null && onConfirmar(valor)}
              disabled={valor === null}
              className={`flex-1 h-12 rounded-xl items-center justify-center ${
                valor === null ? 'bg-surface-elev' : 'bg-blue-500 active:bg-blue-400'
              }`}
            >
              <Text className={`font-bold ${valor === null ? 'text-ink-subtle' : 'text-white'}`}>Salvar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Cabeçalho
// -----------------------------------------------------------------------------

function CabecalhoSimples({
  pedido, percent, segundos, onBack,
}: {
  pedido: Pedido
  percent: number
  segundos: number
  onBack: () => void
}) {
  return (
    <View className="bg-surface-card border-b border-surface-border px-4 py-3 flex-row items-center gap-3">
      <Pressable onPress={onBack} className="w-11 h-11 items-center justify-center">
        <Text className="text-ink-muted text-xl">←</Text>
      </Pressable>
      <View className="flex-1">
        <Text className="font-bold text-base text-ink">#{pedido.numero_externo}</Text>
        <Text className="text-sm text-ink-muted" numberOfLines={1}>
          {pedido.cliente || '—'}
        </Text>
      </View>
      <View className="items-end">
        <Text className={`text-xl font-bold ${percent >= 100 ? 'text-emerald-400' : 'text-ink'}`}>
          {percent}%
        </Text>
        <Text className="text-xs text-ink-subtle">{formatTimer(segundos)}</Text>
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Lista de volumes (acordeão)
// -----------------------------------------------------------------------------

function ListaVolumes({
  volumes, itens, ativoId, permiteEdicao,
  onAtivar, onRemoverItem, onRemoverVolume,
}: {
  volumes: Volume[]
  itens: ItemPedido[]
  ativoId: number | null
  permiteEdicao: boolean
  onAtivar: (volumeId: number) => void
  onRemoverItem: (volumeId: number, volumeItemId: number) => void
  onRemoverVolume: (volumeId: number) => void
}) {
  const [expandido, setExpandido] = useState<number | null>(ativoId)
  const itemMap = new Map(itens.map((i) => [i.id, i]))

  return (
    <View className="bg-surface-elev/30 border-b border-surface-border">
      <Text className="px-4 pt-3 pb-1 text-xs text-ink-subtle uppercase tracking-wide">
        Volumes ({volumes.length})
      </Text>
      <View className="px-2 pb-2 gap-1.5">
        {volumes.map((v) => {
          const aberto = expandido === v.id
          const totalUnid = v.itens.reduce((s, i) => s + i.qtd, 0)
          const ehAtivo = v.id === ativoId
          return (
            <View key={v.id} className="bg-surface-card rounded-lg border border-surface-border overflow-hidden">
              <Pressable
                onPress={() => setExpandido(aberto ? null : v.id)}
                className="px-3 py-2 flex-row items-center gap-2 active:bg-surface-elev"
              >
                <View className={`px-2 py-0.5 rounded-full ${
                  ehAtivo ? 'bg-blue-500/15' : 'bg-surface-elev'
                }`}>
                  <Text className={`text-xs font-medium ${
                    ehAtivo ? 'text-blue-300' : 'text-ink-muted'
                  }`}>
                    {ehAtivo ? 'ativo' : tipoLabel(v.tipo)}
                  </Text>
                </View>
                <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                  {v.identificador || `${tipoLabel(v.tipo)} #${v.id}`}
                </Text>
                <Text className="text-xs text-ink-muted">
                  {v.itens.length} bip · {totalUnid} unid
                </Text>
                <Text className="text-ink-subtle text-sm">{aberto ? '▾' : '▸'}</Text>
              </Pressable>
              {aberto ? (
                <View className="border-t border-surface-border px-3 py-2 gap-1">
                  {permiteEdicao && !ehAtivo && !v.fechado_em ? (
                    <Pressable
                      onPress={() => onAtivar(v.id)}
                      className="mb-1 px-3 h-10 rounded-lg bg-blue-500 items-center justify-center"
                    >
                      <Text className="text-sm font-semibold text-white">
                        Tornar este o volume ativo
                      </Text>
                    </Pressable>
                  ) : null}
                  {v.itens.length === 0 ? (
                    <View className="flex-row items-center justify-between py-1">
                      <Text className="text-xs text-ink-subtle italic">Vazio</Text>
                      {permiteEdicao ? (
                        <Pressable
                          onPress={() => onRemoverVolume(v.id)}
                          className="px-3 h-9 rounded-lg bg-red-500/15 border border-red-500/30 items-center justify-center"
                        >
                          <Text className="text-xs font-semibold text-red-300">Apagar volume</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : v.itens.map((vi) => {
                    const item = itemMap.get(vi.pedido_item_id)
                    return (
                      <View key={vi.id} className="flex-row items-center gap-2">
                        <Text className="flex-1 text-sm text-ink" numberOfLines={1}>
                          {item ? (item.descricao || item.sku) : `item #${vi.pedido_item_id}`}
                        </Text>
                        <Text className="text-sm font-bold text-ink">{vi.qtd}×</Text>
                        {permiteEdicao ? (
                          <Pressable
                            onPress={() => onRemoverItem(v.id, vi.id)}
                            hitSlop={8}
                            className="w-8 h-8 rounded-md items-center justify-center active:bg-red-500/20"
                          >
                            <Text className="text-red-400 text-base">🗑</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )
                  })}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>
    </View>
  )
}

// -----------------------------------------------------------------------------
// Modal — Novo volume
// -----------------------------------------------------------------------------

function ModalNovoVolume({
  volumes, onCancelar, onConfirmar,
}: {
  volumes: Volume[]
  onCancelar: () => void
  onConfirmar: (tipo: 'caixa' | 'fardo' | 'outro', identificador: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [tipo, setTipo] = useState<'caixa' | 'fardo' | 'outro'>('caixa')
  const [identificador, setIdentificador] = useState(() => proximoIdentificador(volumes, 'caixa'))
  const [editado, setEditado] = useState(false)

  function escolherTipo(t: 'caixa' | 'fardo' | 'outro') {
    setTipo(t)
    if (!editado) setIdentificador(proximoIdentificador(volumes, t))
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancelar}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancelar}>
        <Pressable
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-bold text-lg text-ink mb-4">Novo volume</Text>

          <View className="flex-row gap-2 mb-4">
            {(['caixa', 'fardo', 'outro'] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => escolherTipo(t)}
                className={`flex-1 h-14 rounded-xl border-2 items-center justify-center ${
                  tipo === t
                    ? 'border-blue-500 bg-blue-500/15'
                    : 'border-surface-border bg-surface-card'
                }`}
              >
                <Text className={`font-semibold text-sm capitalize ${
                  tipo === t ? 'text-blue-300' : 'text-ink-muted'
                }`}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-xs text-ink-muted mb-1">Identificador</Text>
          <TextInput
            value={identificador}
            onChangeText={(v) => { setIdentificador(v); setEditado(true) }}
            placeholder="ex: Caixa 1"
            placeholderTextColor="#52525b"
            className="h-12 px-4 bg-surface-bg border-2 border-surface-border text-ink rounded-xl text-base mb-4"
          />

          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancelar}
              className="flex-1 h-12 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink font-medium">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirmar(tipo, identificador.trim())}
              className="flex-1 h-12 bg-zinc-100 active:bg-zinc-300 rounded-xl items-center justify-center"
            >
              <Text className="text-zinc-900 font-bold">Criar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Modal — Bipar item
// -----------------------------------------------------------------------------

function ModalBipar({
  item, volumeId, pedidoId, codigoInicial, onFechar, onSucesso,
}: {
  item: ItemPedido
  volumeId: number
  pedidoId: number
  codigoInicial?: string
  onFechar: () => void
  onSucesso: () => void
}) {
  const insets = useSafeAreaInsets()
  const [qtd, setQtd] = useState('1')
  const [codigo, setCodigo] = useState(codigoInicial || '')
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [tipoMsg, setTipoMsg] = useState<'erro' | 'aviso' | null>(null)
  const [cameraAberta, setCameraAberta] = useState(false)
  const codigoRef = useRef<TextInput>(null)
  const qtdRef = useRef<TextInput>(null)
  const restante = item.qtd_pedida - item.qtd_separada
  const qtdNum = Number(qtd) || 0

  useEffect(() => {
    // Se veio com código preenchido (scanner da lista), foca direto na qtd
    setTimeout(() => {
      if (codigoInicial) qtdRef.current?.focus()
      else codigoRef.current?.focus()
    }, 200)
  }, [codigoInicial])

  async function enviar() {
    const cod = codigo.trim()
    if (!cod || enviando) return
    if (qtdNum < 1) {
      setMensagem('Quantidade inválida')
      setTipoMsg('erro')
      return
    }
    if (qtdNum > restante) {
      setMensagem(`Só restam ${restante} unidade(s)`)
      setTipoMsg('aviso')
      return
    }
    setEnviando(true)
    setMensagem('')
    setTipoMsg(null)
    try {
      await conferenciaApi.bipar(pedidoId, {
        item_id: item.id, qtd: qtdNum, codigo: cod, volume_id: volumeId,
      })
      Vibration.vibrate(60)
      onSucesso()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { resultado?: string; erro?: string } } }
      const status = e?.response?.status
      const resultado = e?.response?.data?.resultado
      Vibration.vibrate([0, 100, 50, 100])
      if (status === 409 && resultado === 'codigo_divergente') {
        setMensagem('Código não corresponde ao item escolhido')
        setTipoMsg('erro')
      } else if (status === 409 && resultado === 'excesso') {
        setMensagem(`Excede a quantidade pedida (${item.qtd_pedida})`)
        setTipoMsg('aviso')
      } else if (status === 404) {
        setMensagem('Item ou volume não encontrado')
        setTipoMsg('erro')
      } else {
        setMensagem(e?.response?.data?.erro ?? 'Erro ao bipar')
        setTipoMsg('erro')
      }
      setCodigo('')
      setTimeout(() => codigoRef.current?.focus(), 80)
    } finally {
      setEnviando(false)
    }
  }

  const corMsg = tipoMsg === 'erro' ? 'text-red-400' : 'text-amber-300'

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFechar}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-black/60 justify-end"
      >
        <Pressable className="flex-1" onPress={onFechar} />
        <View
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-5 pt-5"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <Text className="font-bold text-base text-ink" numberOfLines={2}>
                {item.descricao || item.sku}
              </Text>
              <Text className="text-xs text-ink-subtle mt-0.5">
                {item.sku}{item.ean ? ` · EAN ${item.ean}` : ''}
              </Text>
              <Text className="text-sm text-ink-muted mt-1">
                Restam <Text className="text-ink font-bold">{restante}</Text> de {item.qtd_pedida}
              </Text>
            </View>
            <Pressable onPress={onFechar} className="w-11 h-11 items-center justify-center">
              <Text className="text-ink-subtle text-2xl">×</Text>
            </Pressable>
          </View>

          <Text className="text-xs text-ink-muted mb-1">
            Quantidade <Text className="text-ink-subtle">(restam {restante})</Text>
          </Text>
          <View className="flex-row gap-2 mb-3">
            <Pressable
              onPress={() => setQtd(String(Math.max(1, qtdNum - 1)))}
              className="w-14 h-14 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink text-2xl font-bold">−</Text>
            </Pressable>
            <TextInput
              ref={qtdRef}
              value={qtd}
              onChangeText={(v) => setQtd(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              selectTextOnFocus
              className="flex-1 bg-surface-bg border-2 border-surface-border text-ink rounded-xl font-bold text-center"
              style={{
                height: 56,
                fontSize: 24,
                paddingVertical: 0,
                textAlignVertical: 'center',
                includeFontPadding: false,
              }}
            />
            <Pressable
              onPress={() => setQtd(String(Math.min(restante, qtdNum + 1)))}
              className="w-14 h-14 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink text-2xl font-bold">+</Text>
            </Pressable>
          </View>

          <Text className="text-xs text-ink-muted mb-1">Código de barras</Text>
          <View className="flex-row items-center bg-zinc-900 border-2 border-zinc-700 rounded-xl mb-2 pr-2">
            <TextInput
              ref={codigoRef}
              value={codigo}
              onChangeText={setCodigo}
              placeholder="Bipe ou digite o código"
              placeholderTextColor="#52525b"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={enviar}
              className="flex-1 h-14 px-4 text-white font-mono tracking-wider text-base"
            />
            <Pressable
              onPress={() => setCameraAberta(true)}
              className="w-11 h-11 items-center justify-center"
            >
              <Text className="text-emerald-400 text-xl">📷</Text>
            </Pressable>
          </View>

          {mensagem ? (
            <Text className={`text-xs px-1 mb-3 ${corMsg}`}>{mensagem}</Text>
          ) : null}

          <Pressable
            onPress={enviar}
            disabled={!codigo.trim() || enviando}
            className={`h-12 rounded-xl items-center justify-center ${
              !codigo.trim() || enviando ? 'bg-blue-500/40' : 'bg-blue-500 active:bg-blue-400'
            }`}
          >
            {enviando ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold">Confirmar</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {cameraAberta ? (
        <CameraScanner
          onResultado={(c) => { setCameraAberta(false); setCodigo(c) }}
          onFechar={() => setCameraAberta(false)}
        />
      ) : null}
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Modal — Não Conforme
// -----------------------------------------------------------------------------

function ModalNaoConforme({
  onCancelar, onConfirmar,
}: {
  onCancelar: () => void
  onConfirmar: (motivo: string, detalhe: string) => void
}) {
  const insets = useSafeAreaInsets()
  const [motivo, setMotivo] = useState(MOTIVOS[0].valor)
  const [detalhe, setDetalhe] = useState('')

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancelar}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancelar}>
        <Pressable
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-bold text-lg text-ink mb-1">Marcar como Não Conforme</Text>
          <Text className="text-sm text-ink-muted mb-4">
            O pedido sairá da sua fila e ficará na lista de exceções.
          </Text>

          <View className="gap-2 mb-4">
            {MOTIVOS.map((m) => (
              <Pressable
                key={m.valor}
                onPress={() => setMotivo(m.valor)}
                className={`flex-row items-center gap-3 p-3 rounded-xl border-2 ${
                  motivo === m.valor
                    ? 'border-red-500/60 bg-red-500/15'
                    : 'border-surface-border'
                }`}
              >
                <View
                  className={`w-5 h-5 rounded-full border-2 ${
                    motivo === m.valor ? 'border-red-400 bg-red-500' : 'border-ink-subtle'
                  }`}
                />
                <Text className="text-sm font-medium text-ink">{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-xs text-ink-muted mb-1">Detalhe (opcional)</Text>
          <TextInput
            value={detalhe}
            onChangeText={setDetalhe}
            multiline
            numberOfLines={3}
            placeholder="Descreva o problema…"
            placeholderTextColor="#52525b"
            className="bg-surface-bg border-2 border-surface-border text-ink rounded-xl px-3 py-2 text-sm mb-4"
            style={{ textAlignVertical: 'top', minHeight: 70 }}
          />

          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancelar}
              className="flex-1 h-12 bg-surface-elev rounded-xl items-center justify-center"
            >
              <Text className="text-ink font-medium">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirmar(motivo, detalhe.trim())}
              className="flex-1 h-12 bg-red-500 active:bg-red-400 rounded-xl items-center justify-center"
            >
              <Text className="text-white font-bold">Confirmar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function tipoLabel(t: 'caixa' | 'fardo' | 'outro') {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function proximoIdentificador(volumes: Volume[], tipo: 'caixa' | 'fardo' | 'outro') {
  const label = tipoLabel(tipo)
  const re = new RegExp(`^${label}\\s+(\\d+)$`, 'i')
  let max = 0
  for (const v of volumes) {
    if (v.tipo !== tipo) continue
    const m = (v.identificador || '').match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${label} ${max + 1}`
}

function formatTimer(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
