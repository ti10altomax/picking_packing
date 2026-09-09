'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supervisorApi, pedidosApi, type Paginado } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  cliente: string
  conferido_em: string | null
  conferente: number | null
  conferente_username: string | null
  separado_por_nome: string | null
  separador_nao_identificado: boolean
  qtd_itens: number
  duracao_conferencia: string | null
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

export default function ConferidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Acordeão: quais estão abertos + cache + estado de loading por pedido
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Item[]>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarConferidos({ search, page })
      if (Array.isArray(data)) {
        setPedidos(data)
        setCount(data.length)
        setProximaPagina(null)
      } else {
        setPedidos((prev) => append ? [...prev, ...data.results] : data.results)
        setCount(data.count)
        setProximaPagina(data.next ? page + 1 : null)
      }
    } finally {
      setCarregando(false)
      setCarregandoMais(false)
    }
  }, [])

  useEffect(() => { carregar('', 1, false) }, [carregar])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(busca)
      carregar(busca, 1, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [busca, carregar])

  async function carregarMais() {
    if (proximaPagina) await carregar(buscaAtiva, proximaPagina, true)
  }

  async function alternarExpansao(id: number) {
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    if (!itensCache[id] && !carregandoItens.has(id)) {
      setCarregandoItens((prev) => new Set(prev).add(id))
      try {
        const data = await pedidosApi.buscar(id)
        setItensCache((prev) => ({ ...prev, [id]: data.itens ?? [] }))
      } catch {
        setItensCache((prev) => ({ ...prev, [id]: [] }))
      } finally {
        setCarregandoItens((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pedidos conferidos</h1>
          <p className="text-sm text-ink-muted">Concluídos pelos conferentes</p>
        </div>
        <button onClick={() => carregar(buscaAtiva, 1, false)} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
          Atualizar
        </button>
      </div>

      <div className="mb-3">
        <input
          type="text"
          placeholder="Buscar por número ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
      </div>

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">Nenhum pedido conferido.</p>
      ) : (
        <>
          <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
            <div className="px-4 py-2 border-b border-surface-border bg-surface-elev/50 flex items-center gap-3 text-xs text-ink-muted font-medium">
              <span>Pedido</span>
              <span className="ml-auto">{pedidos.length} de {count}</span>
            </div>
            <ul>
              {pedidos.map((p) => {
                const aberto = expandidos.has(p.id)
                const itens = itensCache[p.id]
                const carregandoEsse = carregandoItens.has(p.id)
                return (
                  <li key={p.id} className="border-b border-surface-border last:border-b-0">
                    <button
                      onClick={() => alternarExpansao(p.id)}
                      className="w-full px-4 py-3 text-left hover:bg-surface-elev/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink">{p.numero_externo}</span>
                            <DocBadges tipo={p.tipo} frete={p.frete} />
                            <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                              Conferido
                            </span>
                          </div>
                          <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                          <p className="text-xs text-ink-subtle mt-1">
                            {p.conferido_em && (
                              <>
                                {new Date(p.conferido_em).toLocaleString('pt-BR', {
                                  day: '2-digit', month: '2-digit',
                                  hour: '2-digit', minute: '2-digit',
                                })}
                                {' · '}
                              </>
                            )}
                            {p.conferente_username
                              ? <>por <strong className="text-ink">{p.conferente_username}</strong></>
                              : 'sem conferente registrado'}
                            {p.separado_por_nome && (
                              <>
                                {' · '}separado por{' '}
                                <strong className={p.separador_nao_identificado ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}>
                                  {p.separado_por_nome}
                                </strong>
                              </>
                            )}
                            {' · '}
                            {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                            {p.duracao_conferencia && (
                              <> · em <strong className="text-ink">{p.duracao_conferencia}</strong></>
                            )}
                          </p>
                        </div>
                        <span className={`text-ink-subtle text-sm shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}>
                          ▸
                        </span>
                      </div>
                    </button>

                    {aberto && (
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-500/30 border-l-4 border-l-emerald-400 dark:border-l-emerald-500 pl-6 pr-4 py-3">
                        {carregandoEsse && !itens ? (
                          <p className="text-xs text-ink-subtle italic">Carregando itens…</p>
                        ) : !itens || itens.length === 0 ? (
                          <p className="text-xs text-ink-subtle italic">Sem itens registrados.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {itens.map((item) => {
                              const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
                              return (
                                <li
                                  key={item.id}
                                  className={`flex items-start gap-3 p-2 rounded-lg ${
                                    item.status === 'cancelado' ? 'bg-surface-elev/60 opacity-60' :
                                    item.status === 'falta' ? 'bg-orange-50 dark:bg-orange-500/10' :
                                    'bg-surface-card shadow-sm border border-emerald-100 dark:border-emerald-500/20'
                                  }`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-ink leading-snug">
                                      {item.descricao || item.sku}
                                    </p>
                                    <p className="text-xs text-ink-subtle mt-0.5">
                                      {item.sku}
                                      {item.ean && (
                                        <>
                                          <span className="mx-1">·</span>
                                          <code className="font-mono">{item.ean}</code>
                                        </>
                                      )}
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    {item.status === 'cancelado' && (
                                      <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-ink-muted px-2 py-0.5 rounded-full">cancelado</span>
                                    )}
                                    {item.status === 'falta' && (
                                      <span className="text-xs bg-orange-200 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded-full">em falta</span>
                                    )}
                                    {item.status === 'ok' && (
                                      <span className={`text-sm font-bold ${completo ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink'}`}>
                                        {item.qtd_separada}/{item.qtd_pedida}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {proximaPagina && (
            <div className="text-center mt-4">
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="bg-surface-card hover:bg-surface-elev border border-surface-border text-ink rounded-xl px-6 py-3 text-sm font-medium min-h-[44px] disabled:opacity-50 transition-colors"
              >
                {carregandoMais ? 'Carregando…' : `Carregar mais (${count - pedidos.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
