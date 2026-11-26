import { useEffect, useState, useCallback, useRef } from 'react'
import { useToast } from '@/components/Toast'
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
  AppState,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { conferenciaApi, separadoresApi, SeparadorLiberado, type VereditoEtiqueta } from '@/lib/api'
import { CameraScanner, INTERVALO_REPETIR_MS } from '@/components/CameraScanner'
import { TEM_DATAWEDGE, ligarLeitorContinuo, desligarLeitorContinuo } from '@/modules/datawedge'
import { EscolherImpressora } from '@/components/EscolherImpressora'
import { useDialog } from '@/components/Dialog'
import { DocBadges } from '@/components/DocBadges'

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

type DivergenciaFardo = {
  codpro: string
  tam: string
  qtd: number
  restante: number
  motivo: 'excede' | 'fora_do_documento'
}

function textoDivergencia(d: DivergenciaFardo) {
  return `${d.codpro} ${d.tam}: ${d.qtd} na OP — ${
    d.motivo === 'excede' ? `faltam só ${d.restante}` : 'não é deste documento'
  }`
}


type ItemPedido = {
  id: number
  sku: string
  descricao: string
  ean: string
  /** Barras erradas da fábrica cadastradas como alternativas do EAN (2026-11-17) */
  codigos_alternativos?: string[]
  qtd_pedida: number
  qtd_separada: number
  status: 'ok' | 'cancelado' | 'falta'
}

/** O código bipado é deste item? EAN e SKU exatos, ou uma barra errada cadastrada para o EAN. */
function codigoDoItem(i: ItemPedido, cod: string) {
  return i.ean === cod || i.sku === cod || (i.codigos_alternativos ?? []).includes(cod)
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
  op?: string
  fechado_em: string | null
  itens: VolumeItem[]
}

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  status: 'atribuido' | 'conferindo' | 'conferido' | 'nao_conforme' | 'cancelado'
  cancelado_em?: string | null
  qtd_itens: number
  estimativa_caixas?: EstimativaCaixas | null
  // Nota já num embarque do Senior (2026-11-24) — só aviso; a conferência segue normal
  embarque?: { numero: string; placa: string; motorista: string; embarcado_em: string | null } | null
  separado_por: { id: number; nome: string; apelido: string } | null
  separador_nao_identificado: boolean
  itens: ItemPedido[]
  volumes: Volume[]
}

// soma(qtd × medidas da derivação no Senior) / caixa padrão — calculada no backend (2026-11-23)
type EstimativaCaixas = { caixas: number; itens_sem_medida: number }
// devolvido pelo bipar só na leitura que fez a caixa passar de 1 caixa padrão
type CaixaCheia = { ocupacao: number }

// Nota que o Senior já tem num embarque: uma linha só (o bloco de cima é fixo, ver 0.15.3).
function AvisoEmbarque({ embarque, className = '' }: { embarque?: { numero: string; placa: string } | null; className?: string }) {
  if (!embarque) return null
  return (
    <View className={`rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 ${className}`}>
      <Text className="text-sm font-bold text-amber-400">
        🚚 Nota já embarcada no Senior · embarque {embarque.numero}{embarque.placa ? ` · ${embarque.placa}` : ''}
      </Text>
    </View>
  )
}

// Aviso de que o documento não cabe numa caixa só. Compacto: no coletor o bloco de cima
// é fixo e não pode crescer (ver o fix do Concluir sumindo, 0.15.3).
function AvisoCaixas({ estimativa, className = '' }: { estimativa?: EstimativaCaixas | null; className?: string }) {
  if (!estimativa || estimativa.caixas <= 1) return null
  const caixas = estimativa.caixas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  const semMedida = estimativa.itens_sem_medida
  return (
    <View className={`rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 ${className}`}>
      <Text className="text-sm font-bold text-amber-400">📦 Mais de uma caixa · ≈ {caixas} caixas</Text>
      {semMedida > 0 && (
        <Text className="text-xs text-amber-400/80">
          {semMedida} {semMedida === 1 ? 'item sem medida' : 'itens sem medida'} no Senior (fora da conta)
        </Text>
      )}
    </View>
  )
}

// 409 `pedido_cancelado`: o servidor bloqueou porque o documento foi cancelado no
// Senior. Quem detecta é o beat; a tela descobre aqui ou no polling do detalhe.
function foiCancelado(err: unknown) {
  const e = err as { response?: { status?: number; data?: { resultado?: string } } }
  return e?.response?.status === 409 && e?.response?.data?.resultado === 'pedido_cancelado'
}

// Multiplicadores do botão Qtd (fixos, pedido do usuário em 2026-11-20)
const MULTIPLICADORES = [2, 4, 6, 12] as const

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
  const toast = useToast()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [segundos, setSegundos] = useState(0)
  const [modalNovoVolume, setModalNovoVolume] = useState(false)
  const [moverAberto, setMoverAberto] = useState(false)
  const [modalNaoConforme, setModalNaoConforme] = useState(false)
  const [modalConcluir, setModalConcluir] = useState(false)
  // Etiqueta de volume: seletor de impressora quando não há padrão configurada
  const [modalImpressora, setModalImpressora] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemPedido | null>(null)
  const [codigoInicial, setCodigoInicial] = useState('')
  const [cameraGlobalAberta, setCameraGlobalAberta] = useState(false)

  // Leitor contínuo do coletor Zebra (2026-11-10, pedido do usuário): o "fica ligado" da
  // câmera, mas no leitor da frente do TC21, pelo DataWedge (modules/datawedge). O botão
  // "Leitor" só existe onde há DataWedge; a leitura continua chegando como teclado na barra,
  // e o próprio DataWedge segura o MESMO código por INTERVALO_REPETIR_MS. Desliga sozinho ao
  // abrir um modal, sair da tela ou mandar o app pro fundo (senão o feixe ficaria aceso).
  const [leitorLigado, setLeitorLigado] = useState(false)
  const [leitorOcupado, setLeitorOcupado] = useState(false)
  const leitorLigadoRef = useRef(false)
  // trava do mesmo código no leitor contínuo: em coletor que apaga o feixe após cada leitura
  // o módulo reacende na hora e a peça ainda está na frente — sem isso lançaria 2
  const ultimaLeituraLeitor = useRef<{ codigo: string; ts: number } | null>(null)

  // Scanner de hardware (Zebra TC21 via DataWedge em modo teclado): um TextInput
  // sempre focado recebe os caracteres + Enter. Sem teclado virtual
  // (showSoftInputOnFocus=false). Mesma barra do web — a câmera é o ícone na ponta.
  const scanRef = useRef<TextInput>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanFlash, setScanFlash] = useState<'erro' | 'ok' | null>(null)

  // Bipagem de 1 em 1 (2026-11-05, pedido do Sup. Pátio): a leitura registra 1 unidade
  // direto. O botão "Qtd" da barra arma só a PRÓXIMA leitura para abrir o modal de
  // quantidade (caixa fechada); depois volta sozinho para 1 em 1. Tocar no item da lista
  // continua abrindo o modal.
  // Multiplicador (2026-11-20, pedido do usuário): cada toque no botão avança um passo —
  // desligado → Qtd (modal na próxima leitura, como antes) → ×2 → ×4 → ×6 → ×12 → desligado.
  // Com multiplicador cada leitura lança N direto, sem modal, e ele FICA ligado até tocar de
  // novo; desliga sozinho ao trocar de volume (e ao sair da tela, porque o estado é local).
  const [passoQtd, setPassoQtd] = useState(0)
  const qtdArmada = passoQtd === 1
  const multiplicador = passoQtd >= 2 ? MULTIPLICADORES[passoQtd - 2] : 1
  const setQtdArmada = (v: boolean) => setPassoQtd(v ? 1 : 0)
  // Leituras seguidas vão em fila e cada uma olha o pedido mais novo — sem isso duas
  // bipadas rápidas do último item pendente passariam pela checagem local.
  const pedidoRef = useRef<Pedido | null>(null)
  const filaBip = useRef<Promise<void>>(Promise.resolve())
  // Leitura em voo (2026-11-18): códigos cuja leitura ainda não voltou do servidor, e até
  // quando cada código fica bloqueado depois da resposta. Com a rede lenta o conferente
  // ficava mirando a mesma barra achando que não leu; os 3 s do leitor/câmera venciam antes
  // da resposta e a peça entrava duas vezes. Agora: aviso "Lido … registrando…" na hora da
  // leitura, e o mesmo código só vale de novo depois da resposta + INTERVALO_REPETIR_MS.
  const emVoo = useRef<Set<string>>(new Set())
  const bloqueioCodigo = useRef<Map<string, number>>(new Map())
  const recargaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Apontamento "separado por" (DESIGN.md §2)
  const [liberados, setLiberados] = useState<SeparadorLiberado[]>([])
  const [apontamento, setApontamento] = useState<number | 'nao_identificado' | null>(null)
  const [modalSeparadoPor, setModalSeparadoPor] = useState(false)

  const carregar = useCallback(async (silencioso = false) => {
    try {
      const data: Pedido = await conferenciaApi.detalhe(pedidoId)
      setPedido(data)
    } catch {
      // No polling, uma falha de rede passageira (wifi do galpão) não vira aviso
      if (!silencioso) setErro('Erro ao carregar pedido')
    } finally {
      setLoading(false)
    }
  }, [pedidoId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { pedidoRef.current = pedido }, [pedido])

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Polling do detalhe: é por aqui que a tela descobre um cancelamento no Senior
  // (o beat marca o pedido a cada 60 s). Sem WebSocket de propósito.
  const cancelado = pedido?.status === 'cancelado'
  useEffect(() => {
    if (loading || cancelado) return
    const t = setInterval(() => carregar(true), 15_000)
    return () => clearInterval(t)
  }, [loading, cancelado, carregar])

  // Sai para "Atribuídos a mim" voltando à lista que já está embaixo na pilha (2026-11-25).
  // Era router.replace('/conferencia'): trocava só esta tela por uma lista nova e a antiga
  // continuava montada embaixo, com o polling dela — uma a mais por conferência concluída.
  function voltarParaLista() {
    if (router.canGoBack()) router.back()
    else router.replace('/conferencia')
  }

  // Qualquer ação recusada por cancelamento: recarrega (o status vira `cancelado`
  // e a tela troca pelo bloqueio). Devolve true se tratou.
  async function tratarCancelado(err: unknown) {
    if (!foiCancelado(err)) return false
    await carregar()
    return true
  }

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
  // trocou de volume → multiplicador desliga (um ×12 esquecido ligado seria erro grande)
  const volumeAtivoId = volumeAtivo?.id ?? null
  const volumeMultRef = useRef<number | null>(null)
  useEffect(() => {
    if (volumeMultRef.current !== null && volumeMultRef.current !== volumeAtivoId) {
      setPassoQtd((p) => (p >= 2 ? 0 : p))
    }
    volumeMultRef.current = volumeAtivoId
  }, [volumeAtivoId])

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
      if (await tratarCancelado(err)) return
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
      if (await tratarCancelado(err)) return
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Erro ao alterar o apontamento')
    }
  }

  async function aoCriarVolume(tipo: 'caixa' | 'fardo' | 'outro', identificador: string) {
    setModalNovoVolume(false)
    try {
      await conferenciaApi.criarVolume(pedidoId, tipo, identificador)
      await carregar()
    } catch (err: unknown) {
      if (await tratarCancelado(err)) return
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
      } else if (res.etiqueta) {
        const abrirSeletor = await avisarEtiqueta(res.etiqueta as VereditoEtiqueta)
        if (abrirSeletor) {
          // fica na tela até o conferente imprimir ou cancelar; o fechamento do modal navega
          setModalImpressora(true)
          return
        }
      }
      voltarParaLista()
    } catch (e: unknown) {
      if (await tratarCancelado(e)) return
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        variant: 'danger',
        title: 'Erro ao concluir',
        message: msg ?? 'Não foi possível concluir a conferência.',
      })
    }
  }

  // Etiqueta de volume (ponto 7): o que aconteceu com a impressão automática.
  // Devolve true quando o conferente quer escolher a impressora agora.
  async function avisarEtiqueta(e: VereditoEtiqueta): Promise<boolean> {
    const vols = `${e.qtd_volumes} volume(s)`
    if (e.resultado === 'enfileirada') {
      // 2026-11-26: só avisa (sem botão para tocar) — a etiqueta sai sozinha na impressora do
      // conferente e a reclamação era justamente o passo a mais no fim da conferência
      toast.ok('Etiquetas enviadas', { detalhe: `${vols} → ${e.impressora}. Cole uma em cada caixa.`, duracao: 5000 })
      return false
    }
    if (e.resultado === 'sem_transportadora') {
      await dialog.alert({
        variant: 'warning',
        title: 'Etiqueta pendente',
        message: 'O documento ainda não tem transportadora no Senior. A etiqueta sai sozinha quando ela chegar.',
      })
      return false
    }
    if (e.resultado === 'sem_nf') {
      await dialog.alert({
        variant: 'warning',
        title: 'Etiqueta pendente',
        message: 'O pedido ainda não foi faturado. A etiqueta sai sozinha quando a nota fiscal for emitida no Senior.',
      })
      return false
    }
    if (e.resultado === 'volumes_divergentes') {
      await dialog.alert(e.carta_automatica ? {
        // 2026-11-26: a carta dos volumes sai sozinha, em segundo plano
        variant: 'info',
        title: 'Ajustando os volumes da nota',
        message: 'A quantidade de volumes é diferente da nota fiscal. A carta de correção está sendo gerada automaticamente; em instantes a etiqueta pode ser impressa pelo supervisor em Conferidos.',
      } : {
        variant: 'warning',
        title: 'Volumes diferentes da NF',
        message: `${e.mensagem ?? 'A quantidade de volumes não bate com a nota fiscal.'} A etiqueta sai sozinha depois da carta de correção (Gestão → Cartas de correção, no web).`,
      })
      return false
    }
    if (e.resultado === 'em_cotacao') {
      await dialog.alert({
        variant: 'info',
        title: 'Nota em cotação',
        message: 'A transportadora desta nota ainda vai mudar. A etiqueta não sai agora — o supervisor imprime quando a cotação terminar.',
      })
      return false
    }
    if (e.resultado === 'sem_impressora_padrao' || e.resultado === 'desligada') {
      return dialog.confirm({
        variant: 'question',
        title: 'Imprimir etiquetas?',
        message: `${vols} conferido(s). Nenhuma impressora padrão configurada — escolher uma agora?`,
        confirmText: 'Escolher impressora',
        cancelText: 'Depois',
      })
    }
    if (e.resultado === 'erro') {
      await dialog.alert({
        variant: 'danger',
        title: 'Etiqueta não enviada',
        message: e.mensagem ?? 'Falha ao enviar para a impressora. O supervisor pode reimprimir em Etiquetas.',
      })
    }
    return false
  }

  async function aoMarcarNaoConforme(motivo: string, detalhe: string) {
    setModalNaoConforme(false)
    try {
      await conferenciaApi.marcarNaoConforme(pedidoId, motivo, detalhe)
      voltarParaLista()
    } catch (err: unknown) {
      if (await tratarCancelado(err)) return
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
    } catch (err: unknown) {
      if (await tratarCancelado(err)) return
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: 'Não foi possível remover o lançamento.',
      })
    }
  }

  async function aoRemoverVolume(volumeId: number) {
    const fardo = pedido?.volumes.find((v) => v.id === volumeId)?.op
    const ok = await dialog.confirm(fardo ? {
      variant: 'danger',
      title: `Desfazer a OP ${fardo}?`,
      message: 'O volume da OP sai e as quantidades voltam para a fila. A OP pode ser lida de novo.',
      confirmText: 'Desfazer',
    } : {
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
      if (await tratarCancelado(e)) return
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        variant: 'danger',
        title: 'Erro',
        message: msg ?? 'Não foi possível apagar o volume.',
      })
    }
  }

  // Scanner global da lista — bipou um código (leitor ou câmera), busca o item
  // Câmera contínua (2026-11-09): fica ligada lendo 1 em 1 e OP; só fecha quando a leitura
  // precisa de outra tela (modal de quantidade) ou de uma ação do conferente (criar volume).
  function processarCodigoLido(cod: string) {
    if (!pedido) return
    if (ehOp(pedido, cod)) {
      if (qtdArmada) setQtdArmada(false)
      lerFardo(cod)
      return
    }
    if (!volumeAtivo) {
      setCameraGlobalAberta(false)
      desligarLeitor()
      falhaScan('Crie um volume antes de bipar', 'Toque em "Novo volume" e bipe de novo.', cod)
      return
    }
    if (!qtdArmada) {
      registrarUm(cod, volumeAtivo.id, multiplicador)
      return
    }
    setCameraGlobalAberta(false)
    const item = itemPendente(pedido, cod)
    setQtdArmada(false)
    if (item) {
      setScanFlash(null)
      setCodigoInicial(cod)
      setItemSelecionado(item)
    } else {
      erroItemNaoPendente(cod)
    }
  }

  // OP do Sisplan: só dígitos, sem tamanho fixo (vai crescer), sempre menor que os 13 do EAN.
  // Código que é de algum item do documento nunca vira OP (SKU tem hífen, não colide).
  function ehOp(p: Pedido, cod: string) {
    return /^\d{1,12}$/.test(cod) && !p.itens.some((i) => codigoDoItem(i, cod))
  }

  // Com multiplicador, prefere o item (mesmo código em G1/G2) onde a quantidade inteira cabe
  function itemPendente(p: Pedido, cod: string, qtd = 1) {
    const pendentes = p.itens.filter(
      (i) =>
        i.status === 'ok' &&
        i.qtd_separada < i.qtd_pedida &&
        codigoDoItem(i, cod),
    )
    return pendentes.find((i) => i.qtd_pedida - i.qtd_separada >= qtd) ?? pendentes[0]
  }

  function erroItemNaoPendente(cod: string) {
    falhaScan(
      'Este código não é de nenhum item pendente',
      'O produto não é deste documento ou o item já está completo.',
      cod,
    )
  }

  // Volume fechado da fábrica (2026-11-05): a etiqueta traz a OP do Sisplan (só dígitos, menos de 13).
  // O backend compara a OP inteira com o que falta; bateu, cria um volume "OP N" (caixa ou fardo, pelo produto) já
  // fechado. Não bateu, não lança nada. Não precisa de volume aberto.
  function lerFardo(op: string) {
    filaBip.current = filaBip.current.then(async () => {
      try {
        const r = await conferenciaApi.fardo(pedidoId, op)
        piscar('ok', 700)
        Vibration.vibrate([0, 60, 60, 60])
        const tipoOp = (r as { volume?: { tipo?: string } }).volume?.tipo
        toast.ok(tipoOp === 'caixa' ? `Caixa OP ${op} conferida` : `Fardo OP ${op} conferido`, {
          detalhe: `${r.itens.length} item(ns) · ${r.pecas} peças — volume fechado`,
          chave: 'leitor',
        })
        await carregar(true)
      } catch (err: unknown) {
        if (await tratarCancelado(err)) return
        const e = err as { response?: { data?: { resultado?: string; erro?: string; divergencias?: DivergenciaFardo[] } } }
        const d = e?.response?.data
        if (d?.resultado === 'fardo_divergente') {
          falhaScan('OP não confere — nada foi lançado', (d.divergencias ?? []).map(textoDivergencia).join('\n'), op, 12000)
        } else if (d?.resultado === 'op_ja_lida') {
          falhaScan('Esta OP já foi lida', d.erro ?? '', op)
        } else if (d?.resultado === 'op_nao_encontrada') {
          falhaScan('OP não encontrada', 'Confira a etiqueta da caixa ou do fardo, ou confira peça a peça.', op)
        } else {
          falhaScan('Não foi possível ler a OP', d?.erro ?? 'Tente de novo.', op)
        }
      }
    }).catch(() => {})
  }

  // Leitura sem "Qtd" armado: 1 unidade (ou o multiplicador ligado) no volume ativo, sem modal
  function registrarUm(cod: string, volumeId: number, qtd = 1) {
    const ate = bloqueioCodigo.current.get(cod)
    if (emVoo.current.has(cod) || (ate !== undefined && Date.now() < ate)) return
    const itemLido = pedidoRef.current ? itemPendente(pedidoRef.current, cod, qtd) : null
    if (itemLido) {
      emVoo.current.add(cod)
      toast.info(`Lido ${itemLido.sku}${qtd > 1 ? ` ×${qtd}` : ''}`, { detalhe: 'registrando…', chave: 'leitor', duracao: 15000 })
    }
    filaBip.current = filaBip.current.then(async () => {
      const p = pedidoRef.current
      if (!p) { emVoo.current.delete(cod); return }
      const item = itemPendente(p, cod, qtd)
      if (!item) {
        emVoo.current.delete(cod)
        erroItemNaoPendente(cod)
        return
      }
      try {
        const r = await conferenciaApi.bipar(pedidoId, {
          item_id: item.id, qtd, codigo: cod, volume_id: volumeId,
        })
        const atual = pedidoRef.current ?? p
        const novo = {
          ...atual,
          itens: atual.itens.map((i) => (i.id === item.id ? { ...i, qtd_separada: r.qtd_separada } : i)),
        }
        pedidoRef.current = novo
        setPedido(novo)
        piscar('ok', 500)
        Vibration.vibrate(40)
        toast.ok(`+${qtd} ${item.sku}`, {
          detalhe: `${item.descricao ? `${item.descricao} · ` : ''}${r.qtd_separada} de ${r.qtd_pedida}${
            r.qtd_separada >= r.qtd_pedida ? ' — item completo' : ''
          }${r.codigo_alternativo ? ' · barra errada da fábrica (registrada)' : ''}`,
          chave: 'leitor',
          duracao: 1500,
        })
        if (r.caixa_cheia) avisarCaixaCheia(r.caixa_cheia)
        // os lançamentos do volume (com id para a lixeira) vêm do servidor; uma recarga
        // depois da rajada de leituras basta
        if (recargaTimer.current) clearTimeout(recargaTimer.current)
        recargaTimer.current = setTimeout(() => carregar(true), 700)
      } catch (err: unknown) {
        if (await tratarCancelado(err)) return
        const e = err as { response?: { status?: number; data?: { resultado?: string; erro?: string } } }
        if (e?.response?.status === 409 && e.response.data?.resultado === 'excesso') {
          const faltam = item.qtd_pedida - item.qtd_separada
          if (qtd > 1 && faltam > 0) {
            falhaScan(
              'Passa do pedido — nada foi lançado',
              `${item.sku}: faltam ${faltam} e o multiplicador ×${qtd} lançaria ${qtd}. Desligue ou troque o multiplicador, ou use Qtd.`,
              cod,
            )
          } else {
            falhaScan('Este item já está completo', `${item.sku}: o pedido tem ${item.qtd_pedida}.`, cod)
          }
        } else {
          falhaScan('A leitura não foi registrada', e?.response?.data?.erro ?? 'Bipe de novo.', cod)
        }
        await carregar(true)
      } finally {
        emVoo.current.delete(cod)
        bloqueioCodigo.current.set(cod, Date.now() + INTERVALO_REPETIR_MS)
      }
    }).catch(() => {})
  }

  const scanFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function piscar(tipo: 'erro' | 'ok', ms: number) {
    setScanFlash(tipo)
    if (scanFlashTimer.current) clearTimeout(scanFlashTimer.current)
    scanFlashTimer.current = setTimeout(() => setScanFlash(null), ms)
  }

  // Caixa cheia (2026-11-23): a leitura que fez a caixa passar do volume da caixa padrão
  // (Configuracao volume_caixa). Diálogo com OK de propósito — toast passa despercebido.
  // O leitor contínuo desliga para o conferente não seguir bipando atrás do diálogo.
  function avisarCaixaCheia(cc: CaixaCheia) {
    desligarLeitor()
    Vibration.vibrate([0, 300, 150, 300, 150, 300])
    dialog.alert({
      title: '📦 Caixa cheia',
      message: `Pelas medidas do Senior, esta caixa já está com ${Math.round(cc.ocupacao * 100)}% do tamanho da caixa padrão. Feche esta caixa e abra uma nova em + Volume antes de continuar.`,
      variant: 'warning',
      confirmText: 'OK, entendi',
    })
  }

  // Barra pisca vermelho + vibra; a mensagem vai para o toast (grande, quebra linha).
  // Até 2026-11-05 ela aparecia no placeholder do campo e não dava para ler no coletor.
  function falhaScan(titulo: string, detalhe: string, codigo: string, duracao?: number) {
    piscar('erro', 1200)
    Vibration.vibrate([0, 100, 50, 100])
    toast.erro(titulo, { detalhe, codigo, chave: 'leitor', duracao })
  }

  async function ligarLeitor() {
    if (leitorOcupado || leitorLigadoRef.current) return
    setLeitorOcupado(true)
    let ok = false
    try {
      ok = await ligarLeitorContinuo(INTERVALO_REPETIR_MS)
    } catch {
      ok = false
    }
    setLeitorOcupado(false)
    if (!ok) {
      toast.erro('Não deu para ligar o leitor', {
        detalhe: 'O DataWedge do coletor não respondeu. Use o gatilho.',
        chave: 'leitor',
      })
      return
    }
    leitorLigadoRef.current = true
    ultimaLeituraLeitor.current = null
    setLeitorLigado(true)
  }

  function desligarLeitor() {
    if (!leitorLigadoRef.current) return
    leitorLigadoRef.current = false
    setLeitorLigado(false)
    desligarLeitorContinuo().catch(() => {})
  }

  // Enter do leitor (ou submit) — consome o que foi digitado na barra
  function handleScan() {
    const cod = scanValue.trim()
    setScanValue('')
    if (!cod) return
    if (leitorLigadoRef.current) {
      const agora = Date.now()
      const ult = ultimaLeituraLeitor.current
      if (ult && ult.codigo === cod && agora - ult.ts < INTERVALO_REPETIR_MS) return
      ultimaLeituraLeitor.current = { codigo: cod, ts: agora }
    }
    processarCodigoLido(cod)
  }

  // Re-foca a barra do scanner sempre que nenhum modal estiver aberto.
  // Os modais (item, volume, NC, separado-por, concluir, câmera) têm os próprios
  // inputs; quando fecham, o leitor volta a alimentar a barra sem toque.
  const algumModalAberto =
    !!itemSelecionado || modalNovoVolume || modalNaoConforme
    || modalSeparadoPor || modalConcluir || cameraGlobalAberta || moverAberto
  useEffect(() => {
    if (loading || algumModalAberto) return
    if (pedido?.status !== 'conferindo') return
    const t = setTimeout(() => scanRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [loading, algumModalAberto, pedido?.status, volumeAtivo?.id])

  // Leitor contínuo: modal aberto (a leitura iria pro campo errado) ou conferência que
  // acabou → desliga; app pro fundo ou saída da tela → desliga também
  useEffect(() => {
    if (algumModalAberto || pedido?.status !== 'conferindo') desligarLeitor()
  }, [algumModalAberto, pedido?.status])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') desligarLeitor()
    })
    return () => {
      sub.remove()
      desligarLeitor()
    }
  }, [])

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

  // Estado: documento cancelado no Senior — bloqueio total, só volta à lista
  if (pedido.status === 'cancelado') {
    return <TelaCancelada pedido={pedido} onVoltar={() => voltarParaLista()} />
  }

  // Estado: ainda não iniciou conferência
  if (pedido.status === 'atribuido') {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
        <CabecalhoSimples pedido={pedido} percent={0} segundos={segundos} onBack={() => router.back()} />
        <ScrollView
          className="flex-1"
          // paddingBottom com a barra de navegação do aparelho: com muitos separadores a lista rola e
          // o botão Iniciar ficava metade atrás dos controles do Android (2026-11-26).
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          }}
        >
          <Text className="text-lg font-semibold text-ink mb-1 text-center">Pronto para iniciar</Text>
          <Text className="text-sm text-ink-subtle mb-6 text-center">
            {pedido.qtd_itens} {pedido.qtd_itens === 1 ? 'item' : 'itens'} · {totalPedido} unidade(s)
          </Text>

          <AvisoEmbarque embarque={pedido.embarque} className="mb-2" />
          <AvisoCaixas estimativa={pedido.estimativa_caixas} className="mb-6" />

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
        <AvisoEmbarque embarque={pedido.embarque} className="mt-1.5" />
        <AvisoCaixas estimativa={pedido.estimativa_caixas} className="mt-1.5" />
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
            <Text className="text-sm text-ink-muted">Nenhum volume aberto — abra um, ou bipe a OP da caixa ou do fardo</Text>
          )}
        </View>
        <Pressable
          onPress={() => setModalNovoVolume(true)}
          className="bg-zinc-100 active:bg-zinc-300 px-4 h-12 rounded-xl items-center justify-center"
        >
          <Text className="text-zinc-900 font-semibold text-sm">+ Volume</Text>
        </Pressable>
      </View>

      {/* Barra do scanner — leitor de hardware digita aqui; bipou, registra 1; "Qtd" arma
          a próxima leitura para abrir o modal de quantidade; ícone abre a câmera */}
      {pedido.status === 'conferindo' ? (
        <>
        <View
          className={`mx-4 mt-3 rounded-xl border-2 h-14 flex-row items-center pl-3 pr-1 ${
            scanFlash === 'erro'
              ? 'border-red-500 bg-red-500/15'
              : scanFlash === 'ok'
              ? 'border-emerald-500 bg-zinc-900'
              : qtdArmada
              ? 'border-amber-400 bg-zinc-900'
              : multiplicador > 1
              ? 'border-sky-400 bg-zinc-900'
              : 'border-zinc-700 bg-zinc-900'
          }`}
        >
          <Text className={`text-lg mr-2 ${scanFlash === 'erro' ? 'text-red-400' : 'text-zinc-400'}`}>⌥</Text>
          <TextInput
            ref={scanRef}
            value={scanValue}
            onChangeText={setScanValue}
            onSubmitEditing={handleScan}
            submitBehavior="submit"
            showSoftInputOnFocus={false}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            placeholder="Bipe o código…"
            placeholderTextColor={scanFlash === 'erro' ? '#f87171' : '#71717a'}
            onBlur={() => {
              // Toque em botão da tela não pode desarmar o leitor
              if (!algumModalAberto && pedido.status === 'conferindo') {
                setTimeout(() => scanRef.current?.focus(), 80)
              }
            }}
            className={`flex-1 h-14 text-base font-mono tracking-wider ${
              scanFlash === 'erro' ? 'text-red-300' : 'text-white'
            }`}
          />
          <Pressable
            onPress={() => setPassoQtd((p) => (p + 1) % (MULTIPLICADORES.length + 2))}
            accessibilityRole="button"
            accessibilityState={{ selected: passoQtd > 0 }}
            accessibilityLabel="Quantidade: toque para alternar entre modal e multiplicadores"
            className={`h-11 min-w-[52px] px-3 ml-1 items-center justify-center rounded-lg ${
              qtdArmada ? 'bg-amber-400' : multiplicador > 1 ? 'bg-sky-400' : 'border border-zinc-700 active:bg-zinc-800'
            }`}
          >
            <Text className={`font-bold ${multiplicador > 1 ? 'text-base' : 'text-sm'} ${passoQtd > 0 ? 'text-zinc-950' : 'text-zinc-300'}`}>
              {multiplicador > 1 ? `×${multiplicador}` : 'Qtd'}
            </Text>
          </Pressable>
          {TEM_DATAWEDGE ? (
            <Pressable
              onPress={() => (leitorLigado ? desligarLeitor() : ligarLeitor())}
              disabled={leitorOcupado}
              accessibilityRole="button"
              accessibilityState={{ selected: leitorLigado, busy: leitorOcupado }}
              accessibilityLabel={leitorLigado ? 'Desligar o leitor contínuo' : 'Deixar o leitor ligado para bipar vários códigos'}
              className={`h-11 px-3 ml-1 items-center justify-center rounded-lg ${
                leitorLigado ? 'bg-emerald-500' : 'border border-zinc-700 active:bg-zinc-800'
              }`}
            >
              {leitorOcupado ? (
                <ActivityIndicator size="small" color="#a1a1aa" />
              ) : (
                <Text className={`text-sm font-bold ${leitorLigado ? 'text-zinc-950' : 'text-zinc-300'}`}>Leitor</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setCameraGlobalAberta(true)}
            className="w-12 h-12 items-center justify-center rounded-lg active:bg-zinc-800"
            accessibilityLabel="Ligar a câmera para bipar vários códigos"
          >
            <Text className={`text-xl ${scanFlash === 'erro' ? 'text-red-400' : 'text-emerald-400'}`}>📷</Text>
          </Pressable>
        </View>
        {qtdArmada ? (
          <Text className="mx-4 mt-1.5 text-sm font-semibold text-amber-400">
            Próxima leitura abre a quantidade · toque de novo para ×2
          </Text>
        ) : multiplicador > 1 ? (
          <Text className="mx-4 mt-1.5 text-sm font-semibold text-sky-400">
            Cada leitura lança {multiplicador} unidades ·{' '}
            {passoQtd - 2 < MULTIPLICADORES.length - 1
              ? `toque para ×${MULTIPLICADORES[passoQtd - 1]}`
              : 'toque para desligar'}
            {leitorLigado ? ' · leitor ligado' : ''}
          </Text>
        ) : leitorLigado ? (
          <Text className="mx-4 mt-1.5 text-sm font-semibold text-emerald-400">
            Leitor ligado — bipe um código atrás do outro · o mesmo código só repete depois de {INTERVALO_REPETIR_MS / 1000} s · toque em Leitor para desligar
          </Text>
        ) : null}
        </>
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

      {/* Volumes + itens numa área só que rola. Os volumes ficavam fora do ScrollView,
          empilhados no bloco fixo de cima: com 7 volumes o cabeçalho passava da altura da
          tela do TC21, a lista de itens ficava com altura zero e o rodapé com o Concluir
          saía da tela sem ter como rolar (2026-11-17, chamado de um conferente). */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {volumes.length > 0 && pedido ? (
          <ListaVolumes
            volumes={volumes}
            itens={pedido.itens}
            ativoId={volumeAtivo?.id ?? null}
            permiteEdicao={pedido.status === 'conferindo'}
            onAtivar={setAtivoIdManual}
            onRemoverItem={aoRemoverItem}
            onRemoverVolume={aoRemoverVolume}
            onMover={() => setMoverAberto(true)}
          />
        ) : null}

        <View style={{ padding: 16, gap: 8 }}>
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
        </View>
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
      {moverAberto && pedido.status === 'conferindo' ? (
        <ModalMover
          pedidoId={pedidoId}
          itens={pedido.itens}
          volumes={volumes}
          onCancelar={() => setMoverAberto(false)}
          onMovido={async (destinoId, movidos) => {
            setMoverAberto(false)
            setAtivoIdManual(destinoId)
            toast.ok(`${movidos} lançamento(s) movido(s)`, { detalhe: 'O volume de destino ficou ativo.' })
            await carregar(true)
          }}
        />
      ) : null}
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
          onSucesso={async (caixaCheia) => {
            setItemSelecionado(null)
            setCodigoInicial('')
            await carregar()
            if (caixaCheia) avisarCaixaCheia(caixaCheia)
          }}
          onCancelado={async () => {
            setItemSelecionado(null)
            setCodigoInicial('')
            await carregar()
          }}
        />
      ) : null}

      {cameraGlobalAberta ? (
        <CameraScanner
          continuo
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

      <EscolherImpressora
        visible={modalImpressora}
        pedidoId={pedidoId}
        onClose={() => { setModalImpressora(false); voltarParaLista() }}
      />

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

  // Se o conferente escolheu item+qtd mas esqueceu o "+", inclui na confirmação
  function sobrasEfetivas() {
    const q = Number(qtd)
    if (!itemId || q < 1) return sobras
    const existente = sobras.find((s) => s.item_id === itemId)
    if (existente) return sobras.map((s) => (s.item_id === itemId ? { ...s, qtd: s.qtd + q } : s))
    return [...sobras, { item_id: itemId, qtd: q }]
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
              onPress={() => onConfirmar(sobrasEfetivas())}
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
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="font-bold text-base text-ink">#{pedido.numero_externo}</Text>
          <DocBadges tipo={pedido.tipo} frete={pedido.frete} />
        </View>
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
  onAtivar, onRemoverItem, onRemoverVolume, onMover,
}: {
  volumes: Volume[]
  itens: ItemPedido[]
  ativoId: number | null
  permiteEdicao: boolean
  onAtivar: (volumeId: number) => void
  onRemoverItem: (volumeId: number, volumeItemId: number) => void
  onRemoverVolume: (volumeId: number) => void
  onMover: () => void
}) {
  const [expandido, setExpandido] = useState<number | null>(ativoId)
  const itemMap = new Map(itens.map((i) => [i.id, i]))
  const temMovivel = volumes.some((v) => !v.op && v.itens.length > 0)

  return (
    <View className="bg-surface-elev/30 border-b border-surface-border">
      <View className="px-4 pt-2 pb-1 flex-row items-center justify-between">
        <Text className="text-xs text-ink-subtle uppercase tracking-wide">
          Volumes ({volumes.length})
        </Text>
        {permiteEdicao && temMovivel ? (
          <Pressable
            onPress={onMover}
            className="px-3 h-10 rounded-lg border border-surface-border bg-surface-card items-center justify-center active:bg-surface-elev"
          >
            <Text className="text-xs font-semibold text-ink">⇄ Mover itens</Text>
          </Pressable>
        ) : null}
      </View>
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
                        {/* SKU = código-derivação (2026-11-18): a descrição é igual entre as
                            derivações do mesmo produto e não dava para saber qual apagar */}
                        <Text className="flex-1 text-sm font-mono text-ink" numberOfLines={1}>
                          {item ? item.sku : `item #${vi.pedido_item_id}`}
                        </Text>
                        <Text className="text-sm font-bold text-ink">{vi.qtd}×</Text>
                        {permiteEdicao && !v.fechado_em ? (
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
                  {permiteEdicao && v.op ? (
                    <Pressable
                      onPress={() => onRemoverVolume(v.id)}
                      className="mt-1 h-10 rounded-lg bg-red-500/15 border border-red-500/30 items-center justify-center"
                    >
                      <Text className="text-xs font-semibold text-red-300">Desfazer OP</Text>
                    </Pressable>
                  ) : null}
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
// Modal — Mover lançamentos entre volumes (2026-11-20)
// Estão esquecendo de abrir a caixa nova: marca os lançamentos (inteiros) e manda para outro
// volume ou para um novo, que nasce aberto e vira o ativo. OP da fábrica não entra.
// -----------------------------------------------------------------------------

function ModalMover({
  pedidoId, itens, volumes, onCancelar, onMovido,
}: {
  pedidoId: number
  itens: ItemPedido[]
  volumes: Volume[]
  onCancelar: () => void
  onMovido: (destinoId: number, movidos: number) => void
}) {
  const insets = useSafeAreaInsets()
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [destino, setDestino] = useState<number | 'novo'>('novo')
  const [tipoNovo, setTipoNovo] = useState<'caixa' | 'fardo' | 'outro'>('caixa')
  const [identificador, setIdentificador] = useState(() => proximoIdentificador(volumes, 'caixa'))
  const [editado, setEditado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const itemMap = new Map(itens.map((i) => [i.id, i]))
  const moviveis = volumes.filter((v) => !v.op)
  const origens = new Set(volumes.filter((v) => v.itens.some((vi) => marcados.has(vi.id))).map((v) => v.id))
  const destinoInvalido = destino !== 'novo' && origens.size === 1 && origens.has(destino)

  function alternar(id: number) {
    setMarcados((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function escolherTipo(t: 'caixa' | 'fardo' | 'outro') {
    setTipoNovo(t)
    if (!editado) setIdentificador(proximoIdentificador(volumes, t))
  }

  async function mover() {
    if (marcados.size === 0 || destinoInvalido || enviando) return
    setEnviando(true)
    setErro('')
    try {
      const r = await conferenciaApi.moverLancamentos(pedidoId, {
        volume_item_ids: Array.from(marcados),
        destino: destino === 'novo'
          ? { novo: { tipo: tipoNovo, identificador: identificador.trim() } }
          : { volume_id: destino },
      })
      onMovido(r.destino_id, r.movidos)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg ?? 'Não foi possível mover.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancelar}>
      <View className="flex-1 bg-black/60 justify-end">
        <View
          className="bg-surface-card border-t border-surface-border rounded-t-2xl pt-5"
          style={{ maxHeight: '92%', paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        >
          <View className="px-5 mb-2 flex-row items-start justify-between">
            <View className="flex-1 pr-2">
              <Text className="font-bold text-lg text-ink">Mover itens</Text>
              <Text className="text-xs text-ink-muted">Marque o que vai para outro volume. O lançamento vai inteiro.</Text>
            </View>
            <Pressable onPress={onCancelar} hitSlop={10} className="px-2">
              <Text className="text-ink-subtle text-2xl">×</Text>
            </Pressable>
          </View>

          <ScrollView className="px-4" contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {volumes.map((v) => (
              <View key={v.id} className={`rounded-lg border border-surface-border overflow-hidden ${v.op ? 'opacity-50' : ''}`}>
                <View className="px-3 py-2 bg-surface-elev/60 flex-row items-center">
                  <Text className="flex-1 text-sm font-semibold text-ink" numberOfLines={1}>
                    {v.identificador || `${tipoLabel(v.tipo)} #${v.id}`}
                  </Text>
                  {v.op ? <Text className="text-[10px] uppercase text-ink-muted">fábrica · não move</Text> : null}
                </View>
                {v.itens.length === 0 ? (
                  <Text className="px-3 py-2 text-xs text-ink-subtle italic">Vazio</Text>
                ) : v.itens.map((vi) => {
                  const item = itemMap.get(vi.pedido_item_id)
                  const marcado = marcados.has(vi.id)
                  return (
                    <Pressable
                      key={vi.id}
                      disabled={!!v.op}
                      onPress={() => alternar(vi.id)}
                      className={`flex-row items-center gap-3 px-3 min-h-[48px] border-t border-surface-border/60 ${
                        marcado ? 'bg-emerald-500/15' : 'active:bg-surface-elev'
                      }`}
                    >
                      <View className={`w-6 h-6 rounded-md border-2 items-center justify-center ${
                        marcado ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-500'
                      }`}>
                        {marcado ? <Text className="text-zinc-950 text-sm font-bold">✓</Text> : null}
                      </View>
                      <Text className="flex-1 text-sm font-mono text-ink" numberOfLines={1}>
                        {item ? item.sku : `item #${vi.pedido_item_id}`}
                      </Text>
                      <Text className="text-sm font-bold text-ink">{vi.qtd}×</Text>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </ScrollView>

          <View className="px-4 pt-3 border-t border-surface-border gap-2">
            <Text className="text-xs text-ink-muted">Mover para</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <Pressable
                onPress={() => setDestino('novo')}
                className={`px-3 h-11 rounded-lg border-2 items-center justify-center ${
                  destino === 'novo' ? 'border-blue-500 bg-blue-500/15' : 'border-surface-border'
                }`}
              >
                <Text className={`text-sm font-semibold ${destino === 'novo' ? 'text-blue-300' : 'text-ink-muted'}`}>+ Novo volume</Text>
              </Pressable>
              {moviveis.map((v) => (
                <Pressable
                  key={v.id}
                  onPress={() => setDestino(v.id)}
                  className={`px-3 h-11 rounded-lg border-2 items-center justify-center ${
                    destino === v.id ? 'border-blue-500 bg-blue-500/15' : 'border-surface-border'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${destino === v.id ? 'text-blue-300' : 'text-ink-muted'}`}>
                    {v.identificador || `${tipoLabel(v.tipo)} #${v.id}`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {destino === 'novo' ? (
              <View className="flex-row gap-2">
                {(['caixa', 'fardo', 'outro'] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => escolherTipo(t)}
                    className={`px-3 h-11 rounded-lg border-2 items-center justify-center ${
                      tipoNovo === t ? 'border-blue-500 bg-blue-500/15' : 'border-surface-border'
                    }`}
                  >
                    <Text className={`text-sm capitalize ${tipoNovo === t ? 'text-blue-300' : 'text-ink-muted'}`}>{t}</Text>
                  </Pressable>
                ))}
                <TextInput
                  value={identificador}
                  onChangeText={(v) => { setIdentificador(v); setEditado(true) }}
                  placeholder="Identificador"
                  placeholderTextColor="#52525b"
                  className="flex-1 h-11 px-3 bg-surface-bg border-2 border-surface-border text-ink rounded-lg text-sm"
                />
              </View>
            ) : null}
            {destinoInvalido ? <Text className="text-xs text-amber-400">Os marcados já estão nesse volume.</Text> : null}
            {erro ? <Text className="text-sm text-red-400">{erro}</Text> : null}
            <View className="flex-row gap-3 mt-1">
              <Pressable onPress={onCancelar} className="flex-1 h-12 bg-surface-elev rounded-xl items-center justify-center">
                <Text className="text-ink font-medium">Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={mover}
                disabled={enviando || marcados.size === 0 || destinoInvalido}
                className={`flex-1 h-12 rounded-xl items-center justify-center ${
                  enviando || marcados.size === 0 || destinoInvalido ? 'bg-emerald-600/40' : 'bg-emerald-600 active:bg-emerald-500'
                }`}
              >
                <Text className="text-white font-bold">
                  {enviando ? 'Movendo…' : `Mover${marcados.size > 0 ? ` ${marcados.size}` : ''}`}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
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

// -----------------------------------------------------------------------------
// Tela bloqueante — documento cancelado no Senior durante a conferência
// -----------------------------------------------------------------------------

function TelaCancelada({ pedido, onVoltar }: { pedido: Pedido; onVoltar: () => void }) {
  const insets = useSafeAreaInsets()
  const vibrou = useRef(false)
  useEffect(() => {
    if (vibrou.current) return
    vibrou.current = true
    Vibration.vibrate([0, 200, 100, 200, 100, 400])
  }, [])
  const doc = pedido.tipo === 'nota_fiscal' ? 'Nota fiscal' : 'Pedido'
  return (
    <View className="flex-1 bg-red-600" style={{ paddingTop: insets.top }}>
      <View className="flex-1 items-center justify-center px-6 py-10">
        <View className="w-20 h-20 rounded-full bg-white/15 items-center justify-center mb-6">
          <Text className="text-white text-5xl font-black">!</Text>
        </View>
        <Text className="text-red-100 text-xs font-bold uppercase tracking-widest mb-2">Cancelado no Senior</Text>
        <Text className="text-white text-3xl font-extrabold text-center mb-3">
          {doc} {pedido.numero_externo}
        </Text>
        <Text className="text-white text-lg font-semibold mb-1">Pare a conferência.</Text>
        <Text className="text-red-100 text-sm text-center max-w-[320px]">
          Este documento foi cancelado. Deixe as caixas como estão e avise o Supervisor de Pátio —
          se a nota for reemitida, a conferência pode ser transferida sem desmontar nada.
        </Text>
        {!!pedido.cliente && <Text className="text-red-100 text-sm mt-4 text-center">{pedido.cliente}</Text>}
      </View>
      <View className="px-4" style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}>
        <Pressable
          onPress={onVoltar}
          className="h-14 rounded-2xl bg-white items-center justify-center active:opacity-90"
        >
          <Text className="text-red-700 font-bold text-base">Voltar à lista</Text>
        </Pressable>
      </View>
    </View>
  )
}

function ModalBipar({
  item, volumeId, pedidoId, codigoInicial, onFechar, onSucesso, onCancelado,
}: {
  item: ItemPedido
  volumeId: number
  pedidoId: number
  codigoInicial?: string
  onFechar: () => void
  onSucesso: (caixaCheia?: CaixaCheia | null) => void
  onCancelado: () => void
}) {
  const insets = useSafeAreaInsets()
  const [qtd, setQtd] = useState('1')
  const [codigo, setCodigo] = useState(codigoInicial || '')
  const [enviando, setEnviando] = useState(false)
  const enviandoRef = useRef(false)
  const [mensagem, setMensagem] = useState('')
  const [tipoMsg, setTipoMsg] = useState<'erro' | 'aviso' | null>(null)
  const [cameraAberta, setCameraAberta] = useState(false)
  const codigoRef = useRef<TextInput>(null)
  const qtdRef = useRef<TextInput>(null)
  // Captura invisível do leitor de hardware: fica focada sem teclado virtual.
  // Os campos visíveis (qtd, código) só abrem o teclado quando tocados —
  // no coletor quase sempre se usa +/- e o gatilho, não o teclado.
  const capturaRef = useRef<TextInput>(null)
  const [captura, setCaptura] = useState('')
  const restante = item.qtd_pedida - item.qtd_separada
  const qtdNum = Number(qtd) || 0

  useEffect(() => {
    const t = setTimeout(() => capturaRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [])

  // Leitor bipou dentro do modal: assume o código e confirma com a qtd atual
  function aoCapturar() {
    const cod = captura.trim()
    setCaptura('')
    if (!cod) return
    setCodigo(cod)
    enviar(cod)
  }

  async function enviar(codOverride?: string) {
    const cod = (codOverride ?? codigo).trim()
    // guarda SÍNCRONA (2026-11-23): o Enter do leitor dispara onSubmitEditing duas vezes no
    // mesmo instante e o estado `enviando` ainda não virou — a leitura ia em dobro
    if (!cod || enviando || enviandoRef.current) return
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
    enviandoRef.current = true
    setEnviando(true)
    setMensagem('')
    setTipoMsg(null)
    try {
      const r = await conferenciaApi.bipar(pedidoId, {
        item_id: item.id, qtd: qtdNum, codigo: cod, volume_id: volumeId,
      })
      Vibration.vibrate(60)
      onSucesso(r.caixa_cheia)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { resultado?: string; erro?: string } } }
      const status = e?.response?.status
      const resultado = e?.response?.data?.resultado
      Vibration.vibrate([0, 100, 50, 100])
      if (foiCancelado(err)) {
        onCancelado()
        return
      }
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
      // Leitor continua armado pra tentar de novo, sem subir o teclado
      setTimeout(() => capturaRef.current?.focus(), 80)
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  // mesmo visual do toast: cor sólida e texto grande — a mensagem tem que ser lida no coletor
  const corMsg = tipoMsg === 'erro'
    ? { caixa: 'bg-red-600', texto: 'text-white' }
    : { caixa: 'bg-amber-400', texto: 'text-zinc-950' }

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

          {/* Captura do leitor de hardware — invisível, sem teclado */}
          <TextInput
            ref={capturaRef}
            value={captura}
            onChangeText={setCaptura}
            onSubmitEditing={aoCapturar}
            submitBehavior="submit"
            showSoftInputOnFocus={false}
            autoCapitalize="none"
            autoCorrect={false}
            caretHidden
            style={{ position: 'absolute', opacity: 0, height: 1, width: 1, top: 0, left: 0 }}
          />

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
              onSubmitEditing={() => enviar()}
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
            <View accessibilityRole="alert" className={`flex-row items-start rounded-xl px-3 py-2.5 mb-3 ${corMsg.caixa}`}>
              <View className="w-6 h-6 rounded-full bg-black/15 items-center justify-center mr-2.5 mt-0.5">
                <Text className={`text-sm font-black ${corMsg.texto}`}>!</Text>
              </View>
              <Text className={`flex-1 text-base font-bold leading-snug ${corMsg.texto}`}>{mensagem}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => enviar()}
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
