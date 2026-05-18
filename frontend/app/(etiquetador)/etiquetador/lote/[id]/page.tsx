'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { etiquetasApi } from '@/lib/api'

interface LoteItem {
  id: number
  ordem: number
  confirmado_em: string | null
  pedido: {
    id: number
    numero_externo: string
    cliente: string
    endereco_fisico: string
  }
}

interface Lote {
  id: number
  criado_em: string
  finalizado_em: string | null
  qtd_pedidos: number
  confirmados: number
  mesa: string
  itens: LoteItem[]
}

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

export default function LotePage() {
  const params = useParams()
  const router = useRouter()
  const loteId = Number(params.id)

  const [lote, setLote] = useState<Lote | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanValue, setScanValue] = useState('')
  const [flash, setFlash] = useState<{ tipo: 'ok' | 'erro' | 'ja_confirmado' | null; pedidoId?: number }>({ tipo: null })
  const [finalizando, setFinalizando] = useState(false)
  const [confirmarFinalizar, setConfirmarFinalizar] = useState(false)

  const scanRef = useRef<HTMLInputElement>(null)
  const modalAberto = useRef(false)

  const focusScan = useCallback(() => {
    if (!modalAberto.current) scanRef.current?.focus()
  }, [])

  useEffect(() => {
    carregarLote()
  }, [loteId])

  useEffect(() => {
    if (!loading) focusScan()
  }, [loading, focusScan])

  async function carregarLote() {
    try {
      const data = await etiquetasApi.getLote(loteId)
      setLote(data)
    } finally {
      setLoading(false)
    }
  }

  const dispararFlash = (tipo: typeof flash.tipo, pedidoId?: number) => {
    setFlash({ tipo, pedidoId })
    setTimeout(() => { setFlash({ tipo: null }); focusScan() }, 900)
  }

  const handleScanKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const codigo = scanValue.trim()
    setScanValue('')
    if (!codigo || !lote) return

    try {
      const res = await etiquetasApi.confirmarPedido(loteId, codigo)
      playBeep(880, 150)
      dispararFlash('ok', res.pedido_id)
      setLote((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          confirmados: res.confirmados,
          itens: prev.itens.map((i) =>
            i.pedido.numero_externo === codigo
              ? { ...i, confirmado_em: new Date().toISOString() }
              : i
          ),
        }
      })
    } catch (err: any) {
      const s = err.response?.status
      if (s === 409) {
        playBeep(440, 150)
        dispararFlash('ja_confirmado')
      } else {
        playBeep(200, 300, 'sawtooth')
        dispararFlash('erro')
      }
    }
  }

  const handleFinalizar = async () => {
    if (!lote || finalizando) return
    setFinalizando(true)
    setConfirmarFinalizar(false)
    modalAberto.current = false
    try {
      await etiquetasApi.finalizarLote(loteId)
      router.replace('/etiquetador')
    } catch (e: any) {
      alert(e.response?.data?.erro || 'Erro ao finalizar lote.')
      setFinalizando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando…</div>
  }
  if (!lote) {
    return <div className="flex items-center justify-center min-h-screen text-red-500">Lote não encontrado.</div>
  }

  const tudo = lote.confirmados >= lote.qtd_pedidos
  const flashBg = flash.tipo === 'ok' ? 'border-green-400 bg-green-50' :
    flash.tipo === 'erro' ? 'border-red-400 bg-red-50' :
    flash.tipo === 'ja_confirmado' ? 'border-yellow-400 bg-yellow-50' :
    'border-gray-300 bg-white'

  const flashMsg = flash.tipo === 'ok' ? '✓ Pedido confirmado' :
    flash.tipo === 'erro' ? '✗ Pedido não encontrado neste lote' :
    flash.tipo === 'ja_confirmado' ? '⚠ Já confirmado anteriormente' : ''

  const pendentes = lote.itens.filter((i) => !i.confirmado_em)
  const confirmados = lote.itens.filter((i) => i.confirmado_em)

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
          <p className="font-bold text-base leading-tight">Lote #{lote.id}</p>
          <p className="text-sm text-gray-500">{lote.mesa ? `Mesa: ${lote.mesa}` : 'Etiquetagem em curso'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xl font-bold leading-tight ${tudo ? 'text-green-600' : 'text-gray-900'}`}>
            {lote.confirmados}/{lote.qtd_pedidos}
          </p>
          <p className="text-xs text-gray-400">confirmados</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="bg-white px-4 pt-2 pb-3 border-b">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${tudo ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${lote.qtd_pedidos > 0 ? (lote.confirmados / lote.qtd_pedidos) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Campo de scan */}
      {!lote.finalizado_em && (
        <div className="bg-white px-4 py-3 border-b">
          <div className={`flex items-center gap-2 rounded-xl border-2 px-3 h-12 transition-colors ${flashBg}`}>
            <span className="text-gray-400 text-lg shrink-0">⌥</span>
            <input
              ref={scanRef}
              type="text"
              inputMode="none"
              placeholder={flashMsg || 'Escanear etiqueta ou pedido…'}
              value={scanValue}
              onChange={(e) => setScanValue(e.target.value)}
              onKeyDown={handleScanKey}
              onBlur={() => setTimeout(focusScan, 80)}
              className={`flex-1 outline-none bg-transparent text-base ${
                flash.tipo === 'ok' ? 'placeholder-green-600' :
                flash.tipo === 'erro' ? 'placeholder-red-600' :
                flash.tipo === 'ja_confirmado' ? 'placeholder-yellow-600' :
                'placeholder-gray-400'
              }`}
            />
          </div>
        </div>
      )}

      {/* Lista — pendentes primeiro */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {pendentes.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Pendentes ({pendentes.length})
            </p>
            {pendentes.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border px-4 py-3 bg-white transition-colors ${
                  flash.tipo === 'ok' && flash.pedidoId === item.pedido.id
                    ? 'bg-green-100 border-green-400'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-base">#{item.pedido.numero_externo}</p>
                    <p className="text-sm text-gray-500">{item.pedido.cliente || '—'}</p>
                  </div>
                  {item.pedido.endereco_fisico && (
                    <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded font-bold">
                      {item.pedido.endereco_fisico}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {confirmados.length > 0 && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-2">
              Confirmados ({confirmados.length})
            </p>
            {confirmados.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-2 opacity-70"
              >
                <div>
                  <p className="font-medium text-base text-green-800">#{item.pedido.numero_externo}</p>
                  <p className="text-sm text-green-600">{item.pedido.cliente || '—'}</p>
                </div>
                <span className="text-green-600 text-xl font-bold">✓</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Botão finalizar */}
      {!lote.finalizado_em && (
        <div className="bg-white border-t px-4 py-3">
          <button
            onClick={() => { setConfirmarFinalizar(true); modalAberto.current = true }}
            disabled={!tudo || finalizando}
            className={`w-full h-14 rounded-xl font-bold text-base active:scale-[0.98] transition-transform ${
              tudo ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {finalizando ? 'Finalizando…' :
             tudo ? 'Finalizar lote ✓' :
             `Falta ${pendentes.length} pedido${pendentes.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Modal confirmação */}
      {confirmarFinalizar && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-xl mb-2">Finalizar lote?</h2>
            <p className="text-gray-600 text-sm">
              Todos os {lote.qtd_pedidos} pedidos serão marcados como <strong>Concluído</strong>.
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setConfirmarFinalizar(false); modalAberto.current = false; focusScan() }}
                className="flex-1 h-12 bg-gray-100 text-gray-700 rounded-xl font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleFinalizar}
                className="flex-1 h-12 bg-green-600 text-white rounded-xl font-bold"
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
