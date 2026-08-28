'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
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
  criado_em: string
}

type Volume = {
  id: number
  tipo: 'caixa' | 'fardo' | 'outro'
  identificador: string
  criado_em: string
  fechado_em: string | null
  itens: VolumeItem[]
}

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  status: 'atribuido' | 'conferindo' | 'conferido' | 'nao_conforme'
  qtd_itens: number
  percent_conferido: number
  separado_por: { id: number; nome: string; apelido: string } | null
  separador_nao_identificado: boolean
  itens: ItemPedido[]
  volumes: Volume[]
}

type FlashTipo = 'ok' | 'erro' | 'divergente' | 'excesso' | null

const MOTIVOS = [
  { valor: 'divergencia_qtd', label: 'Divergência de quantidade' },
  { valor: 'produto_errado', label: 'Produto errado' },
  { valor: 'item_ausente', label: 'Item ausente (não conseguiu bipar)' },
]

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function playBeep(freq: number, durMs: number, type: OscillatorType = 'sine') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = freq
    osc.type = type
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durMs / 1000)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + durMs / 1000)
  } catch {}
}

function formatTimer(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default function ConferenciaPedidoPage() {
  const router = useRouter()
  const params = useParams()
  const pedidoId = Number(params.id)
  const dialog = useDialog()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [segundos, setSegundos] = useState(0)
  const [erroGlobal, setErroGlobal] = useState('')

  const [modalNovoVolume, setModalNovoVolume] = useState(false)
  const [modalNaoConforme, setModalNaoConforme] = useState(false)
  const [modalConcluir, setModalConcluir] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState<ItemPedido | null>(null)
  const [codigoInicial, setCodigoInicial] = useState('')

  // Scanner sempre focado quando nenhum modal está aberto
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanValue, setScanValue] = useState('')
  const [scanFlash, setScanFlash] = useState<FlashTipo>(null)
  const [scanMsg, setScanMsg] = useState('')
  const [cameraAberta, setCameraAberta] = useState(false)

  // Apontamento "separado por" (DESIGN.md §2)
  const [liberados, setLiberados] = useState<SeparadorLiberado[]>([])
  const [apontamento, setApontamento] = useState<number | 'nao_identificado' | null>(null)
  const [modalSeparadoPor, setModalSeparadoPor] = useState(false)

  // -------------------------------------------------------------------------
  // Carregamento e timer
  // -------------------------------------------------------------------------

  const carregar = useCallback(async () => {
    try {
      const data: Pedido = await conferenciaApi.detalhe(pedidoId)
      setPedido(data)
    } catch {
      setErroGlobal('Erro ao carregar pedido')
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

  // -------------------------------------------------------------------------
  // Volume ativo = último volume criado e não fechado
  // -------------------------------------------------------------------------

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
  const percent = totalPedido ? Math.round(totalConferido / totalPedido * 1000) / 10 : 0
  const tudo100 = pedido && totalPedido > 0 && totalConferido >= totalPedido

  // -------------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------------

  const iniciar = async () => {
    if (apontamento === null) return
    try {
      await conferenciaApi.iniciar(
        pedidoId,
        apontamento === 'nao_identificado'
          ? { nao_identificado: true }
          : { separado_por: apontamento },
      )
      setErroGlobal('')
      await carregar()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErroGlobal(msg ?? 'Erro ao iniciar conferência')
    }
  }

  const aoAlterarSeparadoPor = async (valor: number | 'nao_identificado') => {
    setModalSeparadoPor(false)
    try {
      await conferenciaApi.alterarSeparadoPor(
        pedidoId,
        valor === 'nao_identificado' ? { nao_identificado: true } : { separado_por: valor },
      )
      await carregar()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErroGlobal(msg ?? 'Erro ao alterar o apontamento')
    }
  }

  const aoCriarVolume = async (tipo: 'caixa' | 'fardo' | 'outro', identificador: string) => {
    setModalNovoVolume(false)
    try {
      await conferenciaApi.criarVolume(pedidoId, tipo, identificador)
      await carregar()
    } catch {
      setErroGlobal('Erro ao criar volume')
    }
  }

  const aoConcluir = async (sobras: { item_id: number; qtd: number }[]) => {
    setModalConcluir(false)
    try {
      const res = await conferenciaApi.concluir(pedidoId, sobras)
      if (res.aguardando_fechamento) {
        await dialog.alert({
          title: 'Sobra registrada',
          message: 'O pedido ficou aguardando o fechamento do Supervisor de Pátio.',
          variant: 'info',
        })
      }
      router.replace('/conferencia')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        title: 'Erro ao concluir',
        message: msg ?? 'Não foi possível concluir a conferência.',
        variant: 'danger',
      })
    }
  }

  const aoMarcarNaoConforme = async (motivo: string, detalhe: string) => {
    setModalNaoConforme(false)
    try {
      await conferenciaApi.marcarNaoConforme(pedidoId, motivo, detalhe)
      router.replace('/conferencia')
    } catch {
      setErroGlobal('Erro ao marcar como não conforme')
    }
  }

  const aoRemoverItem = async (volumeId: number, volumeItemId: number) => {
    if (!pedido) return
    const vi = pedido.volumes
      .find((v) => v.id === volumeId)?.itens
      .find((x) => x.id === volumeItemId)
    const item = vi ? pedido.itens.find((i) => i.id === vi.pedido_item_id) : null
    const desc = item ? (item.descricao || item.sku) : 'item'
    const ok = await dialog.confirm({
      title: 'Remover lançamento?',
      message: `${desc} (${vi?.qtd}×) sairá deste volume. A quantidade volta pra fila e você pode bipar de novo.`,
      variant: 'warning',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await conferenciaApi.removerVolumeItem(pedidoId, volumeId, volumeItemId)
      await carregar()
    } catch {
      await dialog.alert({
        title: 'Erro',
        message: 'Não foi possível remover o lançamento.',
        variant: 'danger',
      })
    }
  }

  const aoRemoverVolume = async (volumeId: number) => {
    const ok = await dialog.confirm({
      title: 'Apagar volume?',
      message: 'O volume será apagado. Só permitido se estiver vazio.',
      variant: 'danger',
      confirmText: 'Apagar',
    })
    if (!ok) return
    try {
      await conferenciaApi.removerVolume(pedidoId, volumeId)
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({
        title: 'Erro',
        message: msg ?? 'Não foi possível apagar o volume.',
        variant: 'danger',
      })
    }
  }

  // Processa um código (vindo do input manual OU da câmera)
  const processarCodigo = (cod: string) => {
    if (!cod || !pedido) return

    if (!volumeAtivo) {
      setScanFlash('erro')
      setScanMsg('Crie um volume antes de bipar')
      playBeep(200, 300, 'sawtooth')
      setTimeout(() => { setScanFlash(null); setScanMsg('') }, 1500)
      return
    }

    const item = pedido.itens.find(
      (i) => i.status === 'ok'
        && i.qtd_separada < i.qtd_pedida
        && (i.ean === cod || i.sku === cod),
    )
    if (item) {
      setCodigoInicial(cod)
      setItemSelecionado(item)
    } else {
      setScanFlash('erro')
      setScanMsg('Código não corresponde a nenhum item pendente')
      playBeep(200, 300, 'sawtooth')
      setTimeout(() => { setScanFlash(null); setScanMsg('') }, 1500)
    }
  }

  const handleScan = () => {
    const cod = scanValue.trim()
    setScanValue('')
    processarCodigo(cod)
  }

  const handleCamera = (cod: string) => {
    setCameraAberta(false)
    processarCodigo(cod.trim())
  }

  // Re-foca o scanner principal sempre que sair de modal/iniciar
  useEffect(() => {
    if (loading) return
    const algumModal = itemSelecionado || modalNovoVolume || modalNaoConforme || modalSeparadoPor || modalConcluir
    if (!algumModal && pedido?.status === 'conferindo') {
      setTimeout(() => scanRef.current?.focus({ preventScroll: true }), 100)
    }
  }, [loading, itemSelecionado, modalNovoVolume, modalNaoConforme, pedido?.status])

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando…</div>
  }
  if (!pedido) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500 px-4 text-center">
        {erroGlobal || 'Pedido não encontrado.'}
      </div>
    )
  }

  // Estado: ainda não iniciou
  if (pedido.status === 'atribuido') {
    return (
      <div className="min-h-screen bg-surface-bg text-ink flex flex-col">
        <Header pedido={pedido} percent={0} segundos={segundos} onBack={() => router.back()} />
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
          <p className="text-lg font-semibold text-ink mb-1">Pronto para iniciar</p>
          <p className="text-sm text-ink-muted mb-6">
            {pedido.qtd_itens} {pedido.qtd_itens === 1 ? 'item' : 'itens'} · {totalPedido} unidade(s)
          </p>

          <div className="w-full max-w-md text-left mb-6">
            <p className="text-sm font-semibold text-ink mb-2">Quem separou este pedido? *</p>
            <SeletorSeparadoPor
              liberados={liberados}
              valor={apontamento}
              onChange={setApontamento}
            />
          </div>

          {erroGlobal && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">{erroGlobal}</p>
          )}

          <button
            onClick={iniciar}
            disabled={apontamento === null}
            className={`px-8 h-14 rounded-2xl font-bold text-base active:scale-[0.98] transition-all ${
              apontamento === null
                ? 'bg-surface-elev text-ink-subtle cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white shadow-lg shadow-blue-500/30 dark:shadow-blue-500/20'
            }`}
          >
            Iniciar conferência
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface-bg text-ink">
      <Header
        pedido={pedido}
        percent={percent}
        segundos={segundos}
        onBack={() => router.back()}
      />

      {/* Barra de progresso */}
      <div className="bg-surface-card px-4 pt-2 pb-3 border-b border-surface-border">
        <div className="h-3 bg-surface-elev rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              tudo100
                ? 'bg-emerald-500 shadow-[0_0_12px_rgb(16_185_129/0.5)]'
                : 'bg-blue-500 shadow-[0_0_12px_rgb(59_130_246/0.5)]'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-ink-subtle mt-1">
          {totalConferido} / {totalPedido} unidades · {volumes.length} volume(s)
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs text-ink-subtle">
            Separado por:{' '}
            {pedido.separador_nao_identificado ? (
              <span className="font-semibold text-amber-600 dark:text-amber-400">Não identificado</span>
            ) : pedido.separado_por ? (
              <span className="font-semibold">{pedido.separado_por.apelido || pedido.separado_por.nome}</span>
            ) : (
              '—'
            )}
          </p>
          {pedido.status === 'conferindo' && (
            <button
              onClick={() => setModalSeparadoPor(true)}
              className="text-xs text-blue-600 dark:text-blue-400 px-1.5 min-h-[28px]"
            >
              trocar
            </button>
          )}
        </div>
      </div>

      {/* Volumes — botão de novo volume + lista expansível */}
      <div className="bg-surface-card px-4 py-3 border-b border-surface-border flex items-center gap-3">
        <div className="flex-1 min-w-0">
          {volumeAtivo ? (
            <>
              <p className="text-xs text-ink-subtle uppercase tracking-wide">Volume atual</p>
              <p className="font-bold text-base truncate">
                {volumeAtivo.identificador || `${tipoLabel(volumeAtivo.tipo)} #${volumeAtivo.id}`}
              </p>
              <p className="text-xs text-ink-muted">
                {volumeAtivo.itens.length} bipagem(ns) · {volumeAtivo.itens.reduce((s, i) => s + i.qtd, 0)} unidade(s)
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Nenhum volume aberto — abra um para começar</p>
          )}
        </div>
        <button
          onClick={() => setModalNovoVolume(true)}
          className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 px-4 h-12 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all shrink-0"
        >
          + Volume
        </button>
      </div>

      {volumes.length > 0 && (
        <ListaVolumes
          volumes={volumes}
          itens={pedido.itens}
          ativoId={volumeAtivo?.id ?? null}
          permiteEdicao={pedido.status === 'conferindo'}
          onAtivar={setAtivoIdManual}
          onRemoverItem={aoRemoverItem}
          onRemoverVolume={aoRemoverVolume}
        />
      )}

      {/* Scanner principal — bipa, abre modal já com código + foco na qtd */}
      {volumeAtivo && (
        <div className="bg-surface-card px-4 py-3 border-b border-surface-border sticky top-14 z-10">
          <div
            className={`flex items-center gap-2 rounded-xl border-2 px-3 h-14 transition-all ${
              scanFlash === 'erro'
                ? 'border-red-500 bg-red-50 dark:bg-red-500/10'
                : 'border-zinc-900 bg-zinc-900 shadow-[0_0_24px_rgb(0_0_0/0.15)] dark:border-zinc-700 dark:shadow-[0_0_24px_rgb(59_130_246/0.15)]'
            }`}
          >
            <span className={`text-lg shrink-0 ${scanFlash === 'erro' ? 'text-red-500' : 'text-zinc-400'}`}>⌥</span>
            <input
              ref={scanRef}
              type="text"
              inputMode="none"
              placeholder={scanMsg || 'Bipe o código…'}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScan() }}
              onBlur={() => setTimeout(() => {
                const algumModal = itemSelecionado || modalNovoVolume || modalNaoConforme || modalSeparadoPor || modalConcluir
                if (!algumModal) scanRef.current?.focus({ preventScroll: true })
              }, 80)}
              className={`flex-1 min-w-0 outline-none bg-transparent text-base font-mono tracking-wider ${
                scanFlash === 'erro'
                  ? 'text-red-700 dark:text-red-400 placeholder-red-500'
                  : 'text-white placeholder-zinc-500 caret-white'
              }`}
            />
            <button
              onClick={() => setCameraAberta(true)}
              className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                scanFlash === 'erro'
                  ? 'text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20'
                  : 'text-emerald-400 hover:bg-zinc-800'
              }`}
              aria-label="Abrir câmera"
              title="Bipar com a câmera"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Scanner por câmera (overlay fullscreen) */}
      {cameraAberta && (
        <CameraScanner
          onResultado={handleCamera}
          onFechar={() => setCameraAberta(false)}
        />
      )}

      {/* Erro global */}
      {erroGlobal && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{erroGlobal}</span>
          <button onClick={() => setErroGlobal('')} className="text-xs px-2">×</button>
        </div>
      )}

      {/* Lista de itens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-32">
        {pedido.itens.map((item) => {
          const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
          const desabilitado = item.status !== 'ok' || completo
          return (
            <button
              key={item.id}
              onClick={() => !desabilitado && volumeAtivo && setItemSelecionado(item)}
              disabled={desabilitado || !volumeAtivo}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-all ${
                completo
                  ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                  : !volumeAtivo
                  ? 'bg-surface-elev border-surface-border opacity-60 cursor-not-allowed'
                  : 'bg-surface-card border-surface-border hover:border-blue-400 dark:hover:border-blue-500/60 hover:shadow-md dark:hover:shadow-blue-500/10 active:scale-[0.99]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug text-ink">
                    {item.descricao || item.sku}
                  </p>
                  <p className="text-xs text-ink-subtle mt-0.5">{item.sku}</p>
                  {item.ean && (
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-sm font-mono bg-surface-elev text-ink px-2 py-0.5 rounded select-all">
                        {item.ean}
                      </code>
                      <button
                        // preventDefault no mousedown: o botão não rouba o foco do scanner,
                        // senão o auto-refoco rola a página pro topo e o clique se perde
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigator.clipboard?.writeText(item.ean)
                        }}
                        className="text-xs text-blue-600 dark:text-blue-400 px-2 py-1 min-h-[32px]"
                        title="Copiar"
                      >
                        copiar
                      </button>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-lg font-bold ${completo ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}>
                    {completo ? '✓' : `${item.qtd_separada}/${item.qtd_pedida}`}
                  </span>
                </div>
              </div>
              {item.status === 'ok' && !completo && item.qtd_pedida > 0 && (
                <div className="mt-2 h-1.5 bg-surface-elev rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all"
                    style={{ width: `${(item.qtd_separada / item.qtd_pedida) * 100}%` }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Botões inferiores */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border px-4 py-3 flex gap-3 z-10">
        <button
          onClick={() => setModalNaoConforme(true)}
          className="flex-1 h-12 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 rounded-xl font-medium text-sm active:scale-[0.98] transition-all"
        >
          Não conforme
        </button>
        <button
          onClick={() => setModalConcluir(true)}
          disabled={!tudo100 || volumes.length === 0}
          className={`flex-2 min-w-[160px] h-12 rounded-xl font-bold text-base active:scale-[0.98] transition-all ${
            tudo100 && volumes.length > 0
              ? 'bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30'
              : 'bg-surface-elev text-ink-subtle cursor-not-allowed'
          }`}
        >
          {tudo100 ? 'Concluir ✓' : `Falta ${totalPedido - totalConferido} unid.`}
        </button>
      </div>

      {/* Modais */}
      {modalNovoVolume && (
        <ModalNovoVolume
          volumes={volumes}
          onCancelar={() => setModalNovoVolume(false)}
          onConfirmar={aoCriarVolume}
        />
      )}

      {itemSelecionado && volumeAtivo && (
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
      )}

      {modalNaoConforme && (
        <ModalNaoConforme
          onCancelar={() => setModalNaoConforme(false)}
          onConfirmar={aoMarcarNaoConforme}
        />
      )}

      {modalConcluir && (
        <ModalConcluir
          itens={pedido.itens.filter((i) => i.status === 'ok')}
          onCancelar={() => setModalConcluir(false)}
          onConfirmar={aoConcluir}
        />
      )}

      {modalSeparadoPor && (
        <ModalSeparadoPor
          liberados={liberados}
          atual={pedido.separador_nao_identificado ? 'nao_identificado' : pedido.separado_por?.id ?? null}
          onCancelar={() => setModalSeparadoPor(false)}
          onConfirmar={aoAlterarSeparadoPor}
        />
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header({ pedido, percent, segundos, onBack }: {
  pedido: Pedido
  percent: number
  segundos: number
  onBack: () => void
}) {
  return (
    <div className="bg-surface-card border-b border-surface-border px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm dark:shadow-none">
      <button
        onClick={onBack}
        className="text-ink-muted hover:text-ink min-w-[44px] min-h-[44px] flex items-center justify-center text-xl transition-colors"
      >
        ←
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-base leading-tight text-ink">#{pedido.numero_externo}</p>
        <p className="text-sm text-ink-muted truncate">{pedido.cliente || '—'}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xl font-bold leading-tight ${percent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}>
          {percent}%
        </p>
        <p className="text-xs text-ink-subtle">{formatTimer(segundos)}</p>
      </div>
    </div>
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
    <div className="bg-surface-elev/50 border-b border-surface-border">
      <p className="px-4 pt-3 pb-1 text-xs text-ink-subtle uppercase tracking-wide">
        Volumes ({volumes.length})
      </p>
      <div className="px-2 pb-2 space-y-1.5">
        {volumes.map((v) => {
          const aberto = expandido === v.id
          const totalUnid = v.itens.reduce((s, i) => s + i.qtd, 0)
          const ehAtivo = v.id === ativoId
          return (
            <div key={v.id} className="bg-surface-card rounded-lg border border-surface-border overflow-hidden">
              <button
                onClick={() => setExpandido(aberto ? null : v.id)}
                className="w-full px-3 py-2 flex items-center gap-2 text-left"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  ehAtivo
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'bg-surface-elev text-ink-muted'
                }`}>
                  {ehAtivo ? 'ativo' : tipoLabel(v.tipo)}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-ink">
                  {v.identificador || `${tipoLabel(v.tipo)} #${v.id}`}
                </span>
                <span className="text-xs text-ink-muted shrink-0">
                  {v.itens.length} bip · {totalUnid} unid
                </span>
                <span className="text-ink-subtle text-sm">{aberto ? '▾' : '▸'}</span>
              </button>
              {aberto && (
                <div className="border-t border-surface-border px-3 py-2 space-y-1">
                  {permiteEdicao && !ehAtivo && !v.fechado_em && (
                    <button
                      onClick={() => onAtivar(v.id)}
                      className="w-full mb-1 px-3 h-9 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                    >
                      Tornar este o volume ativo
                    </button>
                  )}
                  {v.itens.length === 0 ? (
                    <div className="flex items-center justify-between py-1">
                      <p className="text-xs text-ink-subtle italic">Vazio</p>
                      {permiteEdicao && (
                        <button
                          onClick={() => onRemoverVolume(v.id)}
                          className="px-3 h-8 rounded-md bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-500/15 dark:hover:bg-red-500/25 dark:text-red-300 text-xs font-semibold"
                        >
                          Apagar volume
                        </button>
                      )}
                    </div>
                  ) : v.itens.map((vi) => {
                    const item = itemMap.get(vi.pedido_item_id)
                    return (
                      <div key={vi.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate text-ink">
                          {item ? (item.descricao || item.sku) : `item #${vi.pedido_item_id}`}
                        </span>
                        <span className="font-bold text-ink">{vi.qtd}×</span>
                        {permiteEdicao && (
                          <button
                            onClick={() => onRemoverItem(v.id, vi.id)}
                            title="Remover lançamento"
                            className="w-7 h-7 rounded-md text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-500/20 dark:hover:text-red-300 inline-flex items-center justify-center"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Modal — Novo volume
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Modal — Concluir (com registro opcional de sobras — DESIGN.md §4.2)
// -----------------------------------------------------------------------------

function ModalConcluir({ itens, onCancelar, onConfirmar }: {
  itens: ItemPedido[]
  onCancelar: () => void
  onConfirmar: (sobras: { item_id: number; qtd: number }[]) => void
}) {
  const [sobras, setSobras] = useState<{ item_id: number; qtd: number }[]>([])
  const [itemId, setItemId] = useState<number | ''>('')
  const [qtd, setQtd] = useState('1')

  function adicionarSobra() {
    const id = Number(itemId)
    const q = Number(qtd)
    if (!id || q < 1) return
    setSobras((prev) => {
      const existente = prev.find((s) => s.item_id === id)
      if (existente) return prev.map((s) => (s.item_id === id ? { ...s, qtd: s.qtd + q } : s))
      return [...prev, { item_id: id, qtd: q }]
    })
    setItemId('')
    setQtd('1')
  }

  const nomeItem = (id: number) => {
    const i = itens.find((x) => x.id === id)
    return i ? (i.descricao || i.sku) : `item ${id}`
  }

  // Se o conferente escolheu item+qtd mas esqueceu o "+", inclui na confirmação
  function sobrasEfetivas() {
    const id = Number(itemId)
    const q = Number(qtd)
    if (!id || q < 1) return sobras
    const existente = sobras.find((s) => s.item_id === id)
    if (existente) return sobras.map((s) => (s.item_id === id ? { ...s, qtd: s.qtd + q } : s))
    return [...sobras, { item_id: id, qtd: q }]
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative bg-surface-card text-ink rounded-t-2xl w-full max-w-md p-6 pb-8 border-t border-surface-border shadow-2xl">
        <h2 className="font-bold text-lg mb-1">Concluir conferência</h2>
        <p className="text-sm text-ink-muted mb-4">Os volumes serão enviados ao Senior.</p>

        <div className="bg-surface-elev/60 rounded-xl p-3 mb-4">
          <p className="text-sm font-semibold text-ink mb-2">Sobrou mercadoria? (o separador trouxe a mais)</p>

          {sobras.length > 0 && (
            <ul className="space-y-1 mb-2">
              {sobras.map((s) => (
                <li key={s.item_id} className="flex items-center justify-between gap-2 text-sm bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-2.5 py-1.5">
                  <span className="text-ink truncate"><strong>{s.qtd}×</strong> {nomeItem(s.item_id)}</span>
                  <button
                    onClick={() => setSobras((prev) => prev.filter((x) => x.item_id !== s.item_id))}
                    className="text-xs text-red-500 px-1 shrink-0"
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : '')}
              className="flex-1 min-w-0 h-11 px-2 rounded-lg bg-surface-card border border-surface-border text-ink text-sm outline-none"
            >
              <option value="">Escolher item…</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>{i.descricao || i.sku}</option>
              ))}
            </select>
            <input
              value={qtd}
              onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              size={1}
              className="w-16 shrink-0 h-11 px-2 rounded-lg bg-surface-card border border-surface-border text-ink text-sm text-center outline-none"
            />
            <button
              onClick={adicionarSobra}
              disabled={!itemId || !Number(qtd)}
              className="shrink-0 h-11 px-3 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-40"
            >
              +
            </button>
          </div>
          <p className="text-xs text-ink-subtle mt-2">
            Sem sobras, deixe em branco. Com sobras, o fechamento pode ficar com o Sup. Pátio.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 h-12 bg-surface-elev text-ink rounded-xl font-medium hover:bg-surface-border transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={() => onConfirmar(sobrasEfetivas())}
            className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-colors shadow-lg shadow-emerald-600/30"
          >
            Concluir ✓
          </button>
        </div>
      </div>
    </div>
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
    <div className="space-y-2">
      {liberados.length === 0 ? (
        <p className="text-sm text-ink-subtle bg-surface-elev rounded-xl p-3">
          Nenhum separador liberado hoje — peça ao Supervisor de Pátio.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {liberados.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange(s.id)}
              className={`h-12 px-3 rounded-xl border-2 text-sm font-semibold truncate transition-all ${
                valor === s.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/60'
                  : 'border-surface-border bg-surface-card text-ink-muted hover:border-ink-subtle'
              }`}
            >
              {s.apelido || s.nome}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => onChange('nao_identificado')}
        className={`w-full h-11 rounded-xl border-2 text-sm font-semibold transition-all ${
          valor === 'nao_identificado'
            ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/60'
            : 'border-dashed border-surface-border text-ink-subtle hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400'
        }`}
      >
        ⚠ Não identificado
      </button>
    </div>
  )
}

function ModalSeparadoPor({ liberados, atual, onCancelar, onConfirmar }: {
  liberados: SeparadorLiberado[]
  atual: number | 'nao_identificado' | null
  onCancelar: () => void
  onConfirmar: (v: number | 'nao_identificado') => void
}) {
  const [valor, setValor] = useState<number | 'nao_identificado' | null>(atual)
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative bg-surface-card text-ink rounded-t-2xl w-full max-w-md p-6 pb-8 border-t border-surface-border shadow-2xl">
        <h2 className="font-bold text-lg mb-4">Quem separou este pedido?</h2>
        <SeletorSeparadoPor liberados={liberados} valor={valor} onChange={setValor} />
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancelar}
            className="flex-1 h-12 bg-surface-elev text-ink rounded-xl font-medium hover:bg-surface-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => valor !== null && onConfirmar(valor)}
            disabled={valor === null}
            className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 rounded-xl font-bold transition-colors disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalNovoVolume({
  volumes,
  onCancelar,
  onConfirmar,
}: {
  volumes: Volume[]
  onCancelar: () => void
  onConfirmar: (tipo: 'caixa' | 'fardo' | 'outro', identificador: string) => void
}) {
  const [tipo, setTipo] = useState<'caixa' | 'fardo' | 'outro'>('caixa')
  const [identificador, setIdentificador] = useState(() => proximoIdentificador(volumes, 'caixa'))
  const [editado, setEditado] = useState(false)

  function escolherTipo(t: 'caixa' | 'fardo' | 'outro') {
    setTipo(t)
    if (!editado) setIdentificador(proximoIdentificador(volumes, t))
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative bg-surface-card text-ink rounded-t-2xl w-full max-w-md p-6 pb-8 border-t border-surface-border shadow-2xl">
        <h2 className="font-bold text-lg mb-4">Novo volume</h2>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {(['caixa', 'fardo', 'outro'] as const).map((t) => (
            <button
              key={t}
              onClick={() => escolherTipo(t)}
              className={`h-14 rounded-xl border-2 font-semibold text-sm capitalize transition-all ${
                tipo === t
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/60'
                  : 'border-surface-border bg-surface-card text-ink-muted hover:border-ink-subtle'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-muted mb-1">Identificador</label>
        <input
          type="text"
          value={identificador}
          onChange={(e) => { setIdentificador(e.target.value); setEditado(true) }}
          onFocus={(e) => e.target.select()}
          placeholder="ex: Caixa 1, Fardo A…"
          className="w-full h-12 bg-surface-bg border-2 border-surface-border text-ink rounded-xl px-4 text-base placeholder:text-ink-subtle focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 mb-4 transition-colors"
        />

        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 h-12 bg-surface-elev text-ink rounded-xl font-medium hover:bg-surface-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(tipo, identificador.trim())}
            className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 rounded-xl font-bold transition-colors"
          >
            Criar
          </button>
        </div>
      </div>
    </div>
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
  const [qtd, setQtd] = useState('1')
  const [codigo, setCodigo] = useState(codigoInicial || '')
  const [enviando, setEnviando] = useState(false)
  const [flash, setFlash] = useState<FlashTipo>(null)
  const [mensagem, setMensagem] = useState('')
  const [cameraAberta, setCameraAberta] = useState(false)
  const scanRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const restante = item.qtd_pedida - item.qtd_separada
  const qtdNum = Number(qtd) || 0

  useEffect(() => {
    // Se já veio com código (bipou na lista), foco direto na qtd
    setTimeout(() => {
      if (codigoInicial) {
        qtyRef.current?.focus()
        qtyRef.current?.select()
      } else {
        scanRef.current?.focus({ preventScroll: true })
      }
    }, 50)
  }, [codigoInicial])

  const enviar = async () => {
    const cod = codigo.trim()
    if (!cod || enviando) return
    if (qtdNum < 1) {
      setFlash('erro')
      setMensagem('Quantidade inválida')
      return
    }
    if (qtdNum > restante) {
      setFlash('excesso')
      setMensagem(`Só restam ${restante} unidade(s)`)
      return
    }
    setEnviando(true)
    setFlash(null)
    setMensagem('')
    try {
      await conferenciaApi.bipar(pedidoId, {
        item_id: item.id, qtd: qtdNum, codigo: cod, volume_id: volumeId,
      })
      playBeep(880, 150)
      setFlash('ok')
      setTimeout(onSucesso, 350)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { resultado?: string; erro?: string } } }
      const status = e?.response?.status
      const resultado = e?.response?.data?.resultado
      if (status === 409 && resultado === 'codigo_divergente') {
        playBeep(200, 300, 'sawtooth')
        setFlash('divergente')
        setMensagem('Código não corresponde ao item escolhido')
      } else if (status === 409 && resultado === 'excesso') {
        playBeep(440, 250)
        setFlash('excesso')
        setMensagem(`Excede a quantidade pedida (${item.qtd_pedida})`)
      } else if (status === 404) {
        playBeep(200, 300, 'sawtooth')
        setFlash('erro')
        setMensagem('Item ou volume não encontrado')
      } else {
        playBeep(200, 300, 'sawtooth')
        setFlash('erro')
        setMensagem(e?.response?.data?.erro ?? 'Erro ao bipar')
      }
      setCodigo('')
      setTimeout(() => scanRef.current?.focus({ preventScroll: true }), 80)
    } finally {
      setEnviando(false)
    }
  }

  const flashClass =
    flash === 'ok' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/15' :
    flash === 'divergente' ? 'border-red-500 bg-red-50 dark:bg-red-500/15' :
    flash === 'excesso' ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/15' :
    flash === 'erro' ? 'border-red-500 bg-red-50 dark:bg-red-500/15' :
    'border-zinc-900 bg-zinc-900 dark:border-zinc-700'

  const escuro = !flash
  const inputClass = escuro
    ? 'text-white placeholder-zinc-500 caret-white'
    : 'text-ink placeholder-ink-subtle'

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-surface-card text-ink rounded-t-2xl w-full max-w-md p-5 pb-8 border-t border-surface-border shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base leading-tight text-ink">{item.descricao || item.sku}</p>
            <p className="text-xs text-ink-subtle mt-0.5">
              {item.sku}{item.ean ? ` · EAN ${item.ean}` : ''}
            </p>
            <p className="text-sm text-ink-muted mt-1">
              Restam <strong className="text-ink">{restante}</strong> de {item.qtd_pedida}
            </p>
          </div>
          <button onClick={onFechar} className="text-ink-subtle hover:text-ink text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors">
            ×
          </button>
        </div>

        <label className="block text-xs text-ink-muted mb-1">
          Quantidade neste volume <span className="text-ink-subtle">(restam {restante})</span>
        </label>
        <div className="flex items-center gap-2 mb-3 w-full">
          <button
            onClick={() => setQtd(String(Math.max(1, qtdNum - 1)))}
            className="w-12 h-12 bg-surface-elev hover:bg-surface-border text-ink rounded-xl text-2xl font-bold shrink-0 transition-colors"
          >−</button>
          <input
            ref={qtyRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            size={1}
            value={qtd}
            onChange={(e) => setQtd(e.target.value.replace(/[^0-9]/g, ''))}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter' && codigo.trim()) enviar() }}
            className="flex-1 min-w-0 h-12 bg-surface-bg border-2 border-surface-border text-ink rounded-xl px-2 text-center text-2xl font-bold focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 transition-colors"
          />
          <button
            onClick={() => setQtd(String(Math.min(restante, qtdNum + 1)))}
            className="w-12 h-12 bg-surface-elev hover:bg-surface-border text-ink rounded-xl text-2xl font-bold shrink-0 transition-colors"
          >+</button>
        </div>

        <label className="block text-xs text-ink-muted mb-1">Código de barras</label>
        <div className={`flex items-center gap-2 rounded-xl border-2 px-3 h-14 mb-2 transition-all ${flashClass}`}>
          <span className={`text-lg shrink-0 ${escuro ? 'text-zinc-400' : 'text-ink-muted'}`}>⌥</span>
          <input
            ref={scanRef}
            type="text"
            inputMode="none"
            placeholder="Bipe o código…"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') enviar() }}
            className={`flex-1 min-w-0 outline-none bg-transparent text-base font-mono tracking-wider ${inputClass}`}
          />
          <button
            onClick={() => setCameraAberta(true)}
            className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              escuro ? 'text-emerald-400 hover:bg-zinc-800' : 'text-emerald-600 dark:text-emerald-400 hover:bg-surface-elev'
            }`}
            aria-label="Abrir câmera"
            title="Bipar com a câmera"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>

        {cameraAberta && (
          <CameraScanner
            onResultado={(c) => { setCameraAberta(false); setCodigo(c) }}
            onFechar={() => setCameraAberta(false)}
          />
        )}

        {mensagem && (
          <p className={`text-xs px-1 mb-3 ${
            flash === 'ok' ? 'text-emerald-600 dark:text-emerald-400' :
            flash === 'excesso' ? 'text-amber-700 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
          }`}>
            {mensagem}
          </p>
        )}

        <button
          onClick={enviar}
          disabled={!codigo.trim() || enviando}
          className="w-full h-12 bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-xl font-bold disabled:opacity-50 transition-colors shadow-lg shadow-blue-500/20"
        >
          {enviando ? 'Enviando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Modal — Marcar Não Conforme
// -----------------------------------------------------------------------------

function ModalNaoConforme({
  onCancelar,
  onConfirmar,
}: {
  onCancelar: () => void
  onConfirmar: (motivo: string, detalhe: string) => void
}) {
  const [motivo, setMotivo] = useState(MOTIVOS[0].valor)
  const [detalhe, setDetalhe] = useState('')

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancelar} />
      <div className="relative bg-surface-card text-ink rounded-t-2xl w-full max-w-md p-6 pb-8 border-t border-surface-border shadow-2xl">
        <h2 className="font-bold text-lg mb-1">Marcar como Não Conforme</h2>
        <p className="text-sm text-ink-muted mb-4">
          O pedido sairá da sua fila e ficará na lista de exceções.
        </p>

        <div className="space-y-2 mb-4">
          {MOTIVOS.map((m) => (
            <label
              key={m.valor}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                motivo === m.valor
                  ? 'border-red-400 bg-red-50 dark:bg-red-500/15 dark:border-red-500/60'
                  : 'border-surface-border hover:border-ink-subtle'
              }`}
            >
              <input
                type="radio"
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
                className="w-5 h-5 accent-red-500"
              />
              <span className="text-sm font-medium text-ink">{m.label}</span>
            </label>
          ))}
        </div>

        <label className="block text-xs text-ink-muted mb-1">Detalhe (opcional)</label>
        <textarea
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
          rows={3}
          placeholder="Descreva o problema…"
          className="w-full bg-surface-bg border-2 border-surface-border text-ink rounded-xl px-3 py-2 text-sm placeholder:text-ink-subtle focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-300 mb-4 transition-colors"
        />

        <div className="flex gap-3">
          <button
            onClick={onCancelar}
            className="flex-1 h-12 bg-surface-elev text-ink rounded-xl font-medium hover:bg-surface-border transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(motivo, detalhe.trim())}
            className="flex-1 h-12 bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400 text-white rounded-xl font-bold transition-colors shadow-lg shadow-red-500/20"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
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
