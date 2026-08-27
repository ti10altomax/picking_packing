'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { pedidosApi } from '@/lib/api'

interface Item {
  id: number
  sku: string
  descricao: string
  ean: string
  qtd_pedida: number
  qtd_separada: number
  status: 'ok' | 'cancelado' | 'falta'
}

interface PedidoDetalhe {
  id: number
  numero_externo: string
  cliente: string
  marketplace_nome: string | null
  status: string
  endereco_fisico: string
  percent_separado: number
  qtd_itens: number
  itens: Item[]
}

type FlashTipo = 'ok' | 'erro' | 'excesso' | null

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

function calcPercent(itens: Item[]) {
  const total = itens.reduce((s, i) => s + (i.status === 'ok' ? i.qtd_pedida : 0), 0)
  if (!total) return 100
  const sep = itens.reduce((s, i) => s + (i.status === 'ok' ? i.qtd_separada : 0), 0)
  return Math.round((sep / total) * 1000) / 10
}

function formatTimer(s: number) {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function ConferenciaPedidoPage() {
  const params = useParams()
  const router = useRouter()
  const pedidoId = Number(params.id)

  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanValue, setScanValue] = useState('')
  const [flash, setFlash] = useState<{ tipo: FlashTipo; itemId?: number }>({ tipo: null })
  const [analise, setAnalise] = useState(false)
  const [modalEndereco, setModalEndereco] = useState(false)
  const [modalManual, setModalManual] = useState(false)
  const [endereco, setEndereco] = useState('')
  const [skuManual, setSkuManual] = useState('')
  const [finalizando, setFinalizando] = useState(false)
  const [segundos, setSegundos] = useState(0)

  const scanRef = useRef<HTMLInputElement>(null)
  const modalAberto = useRef(false)

  const focusScan = useCallback(() => {
    if (!modalAberto.current) scanRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    pedidosApi.buscar(pedidoId).then((data) => {
      setPedido(data)
      setEndereco(data.endereco_fisico || '')
    }).finally(() => setLoading(false))
  }, [pedidoId])

  useEffect(() => {
    if (!loading) focusScan()
  }, [loading, focusScan])

  const dispararFlash = (tipo: FlashTipo, itemId?: number) => {
    setFlash({ tipo, itemId })
    setTimeout(() => setFlash({ tipo: null }), 900)
    setTimeout(focusScan, 150)
  }

  const processarBip = async (codigo: string, manual = false) => {
    if (!codigo.trim() || !pedido) return
    setScanValue('')
    try {
      const res = await pedidosApi.biparItem(pedido.id, codigo, manual)
      playBeep(880, 150)
      dispararFlash('ok', res.item_id)
      setPedido((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          itens: prev.itens.map((i) =>
            i.id === res.item_id ? { ...i, qtd_separada: res.qtd_separada } : i
          ),
        }
      })
    } catch (err: any) {
      const s = err.response?.status
      if (s === 409) {
        playBeep(440, 200)
        dispararFlash('excesso')
      } else {
        playBeep(200, 300, 'sawtooth')
        dispararFlash('erro')
      }
    }
  }

  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = scanValue.trim()
      setScanValue('')
      if (val) processarBip(val)
    }
  }

  const handleManualSubmit = () => {
    const val = skuManual.trim()
    setSkuManual('')
    setModalManual(false)
    modalAberto.current = false
    if (val) processarBip(val, true)
  }

  const itensPendentes = pedido?.itens.filter(
    (i) => i.status === 'ok' && i.qtd_separada < i.qtd_pedida
  ) ?? []
  const percent = pedido ? calcPercent(pedido.itens) : 0
  const tudo100 = percent >= 100

  const handleCancelarItem = async (itemId: number) => {
    if (!pedido) return
    await pedidosApi.cancelarItem(pedido.id, itemId)
    setPedido((prev) =>
      prev ? { ...prev, itens: prev.itens.map((i) => i.id === itemId ? { ...i, status: 'cancelado' } : i) } : prev
    )
  }

  const handleMarcarFalta = async (itemId: number) => {
    if (!pedido) return
    await pedidosApi.marcarFalta(pedido.id, itemId)
    setPedido((prev) =>
      prev ? { ...prev, itens: prev.itens.map((i) => i.id === itemId ? { ...i, status: 'falta' } : i) } : prev
    )
  }

  const confirmarFinalizacao = async () => {
    if (!pedido || !endereco.trim() || finalizando) return
    setFinalizando(true)
    try {
      await pedidosApi.finalizarSeparacao(pedido.id, endereco.trim())
      router.replace('/pedidos')
    } catch {
      setFinalizando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando…</div>
  }
  if (!pedido) {
    return <div className="flex items-center justify-center min-h-screen text-red-500">Pedido não encontrado.</div>
  }

  const flashBg = flash.tipo === 'ok' ? 'bg-green-50 border-green-400' :
    flash.tipo === 'erro' ? 'bg-red-50 border-red-400' :
    flash.tipo === 'excesso' ? 'bg-yellow-50 border-yellow-400' :
    'bg-white border-gray-300'

  const flashMsg = flash.tipo === 'ok' ? '✓ Item conferido' :
    flash.tipo === 'erro' ? '✗ Código não encontrado' :
    flash.tipo === 'excesso' ? '⚠ Quantidade já atingida' : ''

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => router.back()}
          className="text-gray-500 min-w-[44px] min-h-[44px] flex items-center justify-center text-xl"
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight">#{pedido.numero_externo}</p>
          <p className="text-sm text-gray-500 truncate">{pedido.cliente || '—'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xl font-bold leading-tight ${tudo100 ? 'text-green-600' : 'text-gray-900'}`}>
            {percent}%
          </p>
          <p className="text-xs text-gray-400">{formatTimer(segundos)}</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="bg-white px-4 pt-2 pb-3 border-b">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${tudo100 ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {pedido.itens.filter((i) => i.status !== 'ok' || i.qtd_separada >= i.qtd_pedida).length}
          {' / '}
          {pedido.itens.length} itens concluídos
        </p>
      </div>

      {/* Campo de scan */}
      <div className="bg-white px-4 py-3 border-b">
        <div className={`flex items-center gap-2 rounded-xl border-2 px-3 h-12 transition-colors ${flashBg}`}>
          <span className="text-gray-400 text-lg shrink-0">⌥</span>
          <input
            ref={scanRef}
            type="text"
            inputMode="none"
            placeholder={flashMsg || 'Aguardando leitura…'}
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={handleScanKey}
            onBlur={() => setTimeout(focusScan, 80)}
            className={`flex-1 outline-none bg-transparent text-base ${
              flash.tipo === 'ok' ? 'placeholder-green-600' :
              flash.tipo === 'erro' ? 'placeholder-red-600' :
              flash.tipo === 'excesso' ? 'placeholder-yellow-600' :
              'placeholder-gray-400'
            }`}
          />
          <button
            onClick={() => { setModalManual(true); modalAberto.current = true }}
            className="text-xs text-gray-400 min-h-[44px] px-2 shrink-0"
          >
            Manual
          </button>
        </div>
        {flash.tipo === 'excesso' && (
          <p className="text-xs text-yellow-600 mt-1 px-1">
            Quantidade já atingida. Verifique se é uma bipagem dupla.
          </p>
        )}
      </div>

      {/* Lista de itens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {pedido.itens.map((item) => {
          const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
          const flashOk = flash.tipo === 'ok' && flash.itemId === item.id

          return (
            <div
              key={item.id}
              className={`rounded-xl border px-4 py-3 transition-colors duration-300 ${
                item.status === 'cancelado' ? 'bg-gray-100 border-gray-200 opacity-60' :
                item.status === 'falta' ? 'bg-orange-50 border-orange-200' :
                flashOk ? 'bg-green-100 border-green-400' :
                completo ? 'bg-green-50 border-green-200' :
                'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug">{item.descricao || item.sku}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.sku}{item.ean ? ` · ${item.ean}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {item.status === 'cancelado' && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Cancelado</span>
                  )}
                  {item.status === 'falta' && (
                    <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full">Em falta</span>
                  )}
                  {item.status === 'ok' && (
                    <span className={`text-lg font-bold ${completo ? 'text-green-600' : 'text-gray-700'}`}>
                      {completo ? '✓' : `${item.qtd_separada}/${item.qtd_pedida}`}
                    </span>
                  )}
                </div>
              </div>
              {item.status === 'ok' && !completo && item.qtd_pedida > 0 && (
                <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all"
                    style={{ width: `${(item.qtd_separada / item.qtd_pedida) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botões inferiores */}
      <div className="bg-white border-t px-4 py-3 flex gap-3">
        <button
          onClick={() => { setAnalise(true); modalAberto.current = true }}
          className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl font-medium text-sm active:scale-[0.98] transition-transform"
        >
          Análise
        </button>
        <button
          onClick={() => { setModalEndereco(true); modalAberto.current = true }}
          disabled={!tudo100}
          className={`flex-2 min-w-[160px] h-12 rounded-xl font-bold text-base active:scale-[0.98] transition-transform ${
            tudo100 ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {tudo100 ? 'Finalizar ✓' : `Falta ${itensPendentes.length} item${itensPendentes.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Bottom sheet — Análise individual */}
      {analise && (
        <div className="fixed inset-0 z-20 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setAnalise(false); modalAberto.current = false; focusScan() }}
          />
          <div className="relative bg-white rounded-t-2xl max-h-[75vh] flex flex-col">
            <div className="px-4 pt-4 pb-2 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">Análise individual</h2>
              <button
                onClick={() => { setAnalise(false); modalAberto.current = false; focusScan() }}
                className="text-gray-400 text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-2">
              {pedido.itens.filter((i) => i.status === 'ok').map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{item.descricao || item.sku}</p>
                    <p className="text-xs text-gray-400">{item.sku} · {item.qtd_separada}/{item.qtd_pedida}</p>
                  </div>
                  <button
                    onClick={() => handleMarcarFalta(item.id)}
                    className="min-h-[44px] px-3 text-sm bg-orange-100 text-orange-700 rounded-lg font-medium"
                  >
                    Em falta
                  </button>
                  <button
                    onClick={() => handleCancelarItem(item.id)}
                    className="min-h-[44px] px-3 text-sm bg-red-100 text-red-700 rounded-lg font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
              {pedido.itens.filter((i) => i.status !== 'ok').length > 0 && (
                <p className="text-xs text-gray-400 py-3">
                  {pedido.itens.filter((i) => i.status !== 'ok').length} item(s) já tratado(s).
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal — Endereço + Finalizar */}
      {modalEndereco && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-xl mb-1">Endereço físico</h2>
            <p className="text-sm text-gray-500 mb-4">
              Onde a caixa ficará até a etiquetagem. Ex: P5, R3, B5
            </p>
            <input
              type="text"
              autoFocus
              placeholder="P5"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarFinalizacao() }}
              className="w-full h-14 px-4 border-2 border-gray-300 rounded-xl text-2xl font-bold text-center tracking-widest focus:outline-none focus:border-gray-900 uppercase"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setModalEndereco(false); modalAberto.current = false; focusScan() }}
                className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarFinalizacao}
                disabled={!endereco.trim() || finalizando}
                className="flex-1 h-12 bg-green-600 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {finalizando ? 'Finalizando…' : 'Confirmar →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — Digitar SKU manual */}
      {modalManual && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-xl mb-1">Digitar SKU manual</h2>
            <p className="text-sm text-gray-500 mb-4">Item sem etiqueta legível.</p>
            <input
              type="text"
              autoFocus
              placeholder="SKU ou código"
              value={skuManual}
              onChange={(e) => setSkuManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit() }}
              className="w-full h-12 px-4 border-2 border-gray-300 rounded-xl text-base focus:outline-none focus:border-gray-900"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setModalManual(false); modalAberto.current = false; focusScan() }}
                className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!skuManual.trim()}
                className="flex-1 h-12 bg-gray-900 text-white rounded-xl font-bold disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
