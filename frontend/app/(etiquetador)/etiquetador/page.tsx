'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pedidosApi, etiquetasApi } from '@/lib/api'
import { StatusBadge } from '@/components/ui/StatusBadge'

interface Pedido {
  id: number
  numero_externo: string
  cliente: string
  endereco_fisico: string
  ordem_pilha: number | null
}

interface Impressora {
  id: number
  nome: string
  modelo: string
  tipo_conexao: string
  mesa: string
}

export default function EtiquetadorPage() {
  const router = useRouter()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [impressoras, setImpressoras] = useState<Impressora[]>([])
  const [loteAtivo, setLoteAtivo] = useState<{ lote_id: number; qtd_pedidos: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [impressoraSel, setImpressoraSel] = useState<number | null>(null)
  const [modalImprimir, setModalImprimir] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregarDados()
    const t = setInterval(carregarDados, 30_000)
    return () => clearInterval(t)
  }, [])

  async function carregarDados() {
    try {
      const [peds, imps, ativo] = await Promise.all([
        pedidosApi.listar({ status: 'aguardando_etiquetar' }),
        etiquetasApi.listarImpressoras(),
        etiquetasApi.loteAtivo(),
      ])
      const lista = peds.results ?? peds
      lista.sort((a: Pedido, b: Pedido) => (b.ordem_pilha ?? 0) - (a.ordem_pilha ?? 0))
      setPedidos(lista)
      setImpressoras(imps)
      setLoteAtivo(ativo)
      if (imps.length === 1 && !impressoraSel) setImpressoraSel(imps[0].id)
    } finally {
      setLoading(false)
    }
  }

  async function handleCriarLote() {
    if (!impressoraSel) return
    setCriando(true)
    setErro('')
    try {
      const res = await etiquetasApi.criarLote(impressoraSel)
      router.push(`/etiquetador/lote/${res.lote_id}`)
    } catch (e: any) {
      setErro(e.response?.data?.erro || 'Erro ao criar lote.')
      setCriando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando…</div>
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>

      {/* Cabeçalho */}
      <div className="px-4 pt-4 pb-3 bg-white border-b">
        <h1 className="text-xl font-bold">Etiquetagem</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} aguardando
        </p>
      </div>

      {/* Lote ativo */}
      {loteAtivo && (
        <div className="mx-4 mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <p className="font-bold text-blue-800 text-sm">Lote em andamento</p>
          <p className="text-xs text-blue-600 mt-0.5">{loteAtivo.qtd_pedidos} pedidos neste lote</p>
          <button
            onClick={() => router.push(`/etiquetador/lote/${loteAtivo.lote_id}`)}
            className="mt-3 w-full h-11 bg-blue-600 text-white rounded-xl font-bold text-sm active:scale-[0.98] transition-transform"
          >
            Continuar lote →
          </button>
        </div>
      )}

      {/* Botão imprimir lote */}
      {pedidos.length > 0 && !loteAtivo && (
        <div className="px-4 mt-3">
          {erro && <p className="text-red-500 text-sm mb-2">{erro}</p>}
          {impressoras.length > 1 && (
            <select
              value={impressoraSel ?? ''}
              onChange={(e) => setImpressoraSel(Number(e.target.value))}
              className="w-full h-12 border border-gray-300 rounded-xl px-3 text-base mb-3 bg-white"
            >
              <option value="">Selecionar impressora…</option>
              {impressoras.map((imp) => (
                <option key={imp.id} value={imp.id}>
                  {imp.nome} {imp.mesa ? `(${imp.mesa})` : ''}
                </option>
              ))}
            </select>
          )}
          {impressoras.length === 0 && (
            <p className="text-sm text-orange-600 mb-3">
              Nenhuma impressora ativa cadastrada. Configure no admin.
            </p>
          )}
          <button
            onClick={handleCriarLote}
            disabled={!impressoraSel || criando}
            className="w-full h-14 bg-gray-900 text-white rounded-xl font-bold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {criando ? 'Criando lote…' : `Imprimir lote (${pedidos.length} etiqueta${pedidos.length !== 1 ? 's' : ''})`}
          </button>
        </div>
      )}

      {/* Lista de pedidos */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
        {pedidos.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-400">Nenhum pedido aguardando etiquetagem.</div>
        )}
        {pedidos.map((p, idx) => (
          <div
            key={p.id}
            className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-gray-400 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-base">#{p.numero_externo}</p>
                <p className="text-sm text-gray-500">{p.cliente || '—'}</p>
              </div>
              <div className="text-right">
                {p.endereco_fisico && (
                  <span className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded font-bold">
                    {p.endereco_fisico}
                  </span>
                )}
                <p className="text-xs text-gray-400 mt-1">#{idx + 1} da pilha</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
