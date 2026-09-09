'use client'
import { DocBadges, nomeDoc } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback, useRef } from 'react'
import { pedidosApi, divergenciasApi, type Divergencia, type Paginado } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

type PedidoBusca = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  conferente_username: string | null
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

export default function DivergenciasPage() {
  const dialog = useDialog()
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<PedidoBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [pedido, setPedido] = useState<PedidoBusca | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [itemId, setItemId] = useState<number | null>(null)
  const [codigo, setCodigo] = useState('')
  const [qtd, setQtd] = useState('1')
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [historico, setHistorico] = useState<Divergencia[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const carregarHistorico = useCallback(async () => {
    try {
      setHistorico(await divergenciasApi.listar())
    } catch { /* histórico é secundário */ }
  }, [])

  useEffect(() => { carregarHistorico() }, [carregarHistorico])

  // Busca de pedidos em conferência
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!busca.trim()) { setResultados([]); return }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const data: Paginado<PedidoBusca> | PedidoBusca[] = await pedidosApi.listar({
          status: 'conferindo', search: busca.trim(),
        })
        setResultados(Array.isArray(data) ? data : data.results)
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca])

  async function escolherPedido(p: PedidoBusca) {
    setPedido(p)
    setResultados([])
    setItemId(null)
    const detalhe = await pedidosApi.buscar(p.id)
    setItens((detalhe.itens ?? []).filter((i: Item) => i.status === 'ok'))
  }

  async function liberar() {
    if (!pedido || !itemId || !codigo.trim() || !Number(qtd)) return
    setEnviando(true)
    try {
      await divergenciasApi.liberar(pedido.id, {
        item_id: itemId,
        codigo: codigo.trim(),
        qtd: Number(qtd),
        observacao: observacao.trim() || undefined,
      })
      await dialog.alert({
        variant: 'success',
        title: 'Divergência liberada',
        message: 'A bipagem foi registrada no volume aberto do pedido e ficará no relatório de etiquetagem errada.',
      })
      setCodigo('')
      setQtd('1')
      setObservacao('')
      const detalhe = await pedidosApi.buscar(pedido.id)
      setItens((detalhe.itens ?? []).filter((i: Item) => i.status === 'ok'))
      await carregarHistorico()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({ variant: 'danger', title: 'Não foi possível liberar', message: msg ?? 'Erro ao liberar a divergência.' })
    } finally {
      setEnviando(false)
    }
  }

  const itemAtual = itens.find((i) => i.id === itemId)

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-ink">Divergências de barra</h1>
        <p className="text-sm text-ink-muted">
          Mercadoria certa etiquetada errado na fábrica — o supervisor digita a barra lida e libera a bipagem.
          O vínculo vale só para esta ocorrência.
        </p>
      </div>

      {/* Passo 1 — pedido em conferência */}
      <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-4">
        <p className="text-sm font-semibold text-ink mb-2">1. Pedido em conferência</p>
        {pedido ? (
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-ink flex items-center gap-2 flex-wrap">{pedido.numero_externo}<DocBadges tipo={pedido.tipo} frete={pedido.frete} /></p>
              <p className="text-sm text-ink-muted">
                {pedido.cliente || '—'}
                {pedido.conferente_username && ` · conferente: ${pedido.conferente_username}`}
              </p>
            </div>
            <button
              onClick={() => { setPedido(null); setItens([]); setItemId(null) }}
              className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2"
            >
              trocar
            </button>
          </div>
        ) : (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por número ou cliente…"
              className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
            />
            {buscando && <p className="text-xs text-ink-subtle mt-2">Buscando…</p>}
            {resultados.length > 0 && (
              <ul className="mt-2 border border-surface-border rounded-lg overflow-hidden">
                {resultados.slice(0, 8).map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => escolherPedido(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-elev border-b border-surface-border last:border-b-0"
                    >
                      <span className="font-semibold text-ink">{p.numero_externo}</span>
                      <DocBadges tipo={p.tipo} frete={p.frete} />
                      <span className="text-sm text-ink-muted"> · {p.cliente || '—'}</span>
                      {p.conferente_username && (
                        <span className="text-xs text-ink-subtle"> · {p.conferente_username}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Passo 2 — item + barra */}
      {pedido && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-ink mb-2">2. Item correto e barra lida</p>
          <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
            {itens.map((i) => {
              const completo = i.qtd_separada >= i.qtd_pedida
              return (
                <button
                  key={i.id}
                  onClick={() => !completo && setItemId(i.id)}
                  disabled={completo}
                  className={`w-full text-left p-2.5 rounded-lg border-2 transition-all ${
                    itemId === i.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : completo
                      ? 'border-surface-border opacity-50'
                      : 'border-surface-border hover:border-ink-subtle'
                  }`}
                >
                  <p className="text-sm font-medium text-ink leading-snug">{i.descricao || i.sku}</p>
                  <p className="text-xs text-ink-subtle">
                    {i.sku}{i.ean && <> · <code className="font-mono">{i.ean}</code></>} · {i.qtd_separada}/{i.qtd_pedida}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs text-ink-subtle block mb-1">Barra lida (divergente) *</label>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código bipado no coletor"
                className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm font-mono outline-none focus:border-blue-400"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-ink-subtle block mb-1">Qtd *</label>
              <input
                value={qtd}
                onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-ink-subtle block mb-1">Observação</label>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="opcional"
                className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={liberar}
              disabled={enviando || !itemId || !codigo.trim() || !Number(qtd)}
              className="h-11 px-5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-semibold disabled:opacity-40 shadow-lg shadow-amber-500/30 transition-all"
            >
              {enviando ? 'Liberando…' : 'Liberar e registrar'}
            </button>
          </div>
          {itemAtual && (
            <p className="text-xs text-ink-subtle mt-2">
              A bipagem entra no volume aberto do pedido como <strong>{itemAtual.sku}</strong>.
            </p>
          )}
        </div>
      )}

      {/* Histórico */}
      <h2 className="text-lg font-bold text-ink mb-2">Registradas recentemente</h2>
      {historico.length === 0 ? (
        <p className="text-ink-subtle text-sm py-6 text-center">Nenhuma divergência registrada.</p>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <ul>
            {historico.map((d) => (
              <li key={d.id} className="px-4 py-3 border-b border-surface-border last:border-b-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                    {d.codigo_bipado}
                  </code>
                  <span className="text-ink-subtle text-xs">→</span>
                  <span className="text-sm font-medium text-ink">{d.sku}</span>
                  <span className="text-xs text-ink-muted">x{d.qtd}</span>
                </div>
                <p className="text-xs text-ink-subtle mt-1">
                  {nomeDoc(d.tipo)} {d.numero_externo} ·{' '}
                  {new Date(d.criado_em).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                  })}
                  {d.vinculado_por && ` · liberado por ${d.vinculado_por}`}
                  {d.observacao && ` · "${d.observacao}"`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
