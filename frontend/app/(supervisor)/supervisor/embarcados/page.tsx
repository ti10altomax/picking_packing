'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { OndeEsta } from '@/components/pedidos/OndeEsta'
import { ColarListaBotao, FaixaListaColada } from '@/components/pedidos/ListaNotas'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supervisorApi, pedidosApi, type Paginado } from '@/lib/api'
import { ImprimirEtiqueta } from '@/components/etiquetas/ImprimirEtiqueta'
import type { BloqueioEtiqueta } from '@/lib/api'
import { HistoricoBotao } from '@/components/pedidos/HistoricoPedido'
import { TrocarTransportadora } from '@/components/cce/TrocarTransportadora'
import { useCcePermissao } from '@/lib/useCcePermissao'
import { ItensPorVolume, type ItemDoc, type VolumeDoc } from '@/components/pedidos/ItensPorVolume'

/**
 * Embarcados (2026-11-24): documentos cuja nota entrou num embarque do Senior (E145EBQ/E145NFV).
 * O beat `sincronizar_embarques` muda a situação sozinho; aqui é só consulta, agrupada por
 * embarque (caminhão). "Sem conferência" = a nota saiu sem passar pelo Separa.
 */
type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  pedidos_origem?: string[]
  nfs_documento?: string[]
  cliente: string
  conferido_em: string | null
  conferente_username: string | null
  qtd_itens: number
  transportadora?: string
  nf_numero?: string
  etiqueta_volume_em?: string | null
  etiqueta_bloqueio?: BloqueioEtiqueta | null
  embarque_numero: string
  embarque_placa: string
  embarque_motorista: string
  embarcado_em: string | null
  status_anterior: string
}

type Detalhe = { itens: ItemDoc[]; volumes: VolumeDoc[] }
type Filtro = '' | 'com' | 'sem'

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function EmbarcadosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const filtroRef = useRef<Filtro>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const podeCce = useCcePermissao() === true

  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Detalhe>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())
  // Lista colada (2026-11-26): a tela mostra só essas notas (`?ids=`); null = sem filtro
  const [listaColada, setListaColada] = useState<number[] | null>(null)
  const listaRef = useRef<number[] | null>(null)

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarEmbarcados({
        search, page, conferencia: filtroRef.current || undefined,
        ids: listaRef.current ? (listaRef.current.join(',') || '0') : undefined,
      })
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

  const atualizarLinha = useCallback((id: number, campos: Partial<Pedido>) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...campos } : p)))
  }, [])

  useEffect(() => {
    filtroRef.current = filtro
    listaRef.current = listaColada
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(busca)
      carregar(busca, 1, false)
    }, busca ? 300 : 0)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [busca, filtro, listaColada, carregar])

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
        setItensCache((prev) => ({ ...prev, [id]: { itens: data.itens ?? [], volumes: data.volumes ?? [] } }))
      } catch {
        setItensCache((prev) => ({ ...prev, [id]: { itens: [], volumes: [] } }))
      } finally {
        setCarregandoItens((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
  }

  // A lista vem ordenada pela saída e pelo número do embarque: agrupar é só cortar onde muda.
  const grupos: { embarque: string; pedidos: Pedido[] }[] = []
  for (const p of pedidos) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.embarque === p.embarque_numero) ultimo.pedidos.push(p)
    else grupos.push({ embarque: p.embarque_numero, pedidos: [p] })
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Embarcados</h1>
          <p className="text-sm text-ink-muted">Notas que já saíram num embarque do Senior</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ColarListaBotao nomeTela="Embarcados" naTela={(d) => d.lista === 'embarcados'} onFiltrar={setListaColada} />
          <button onClick={() => carregar(buscaAtiva, 1, false)} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2 shrink-0">
            Atualizar
          </button>
        </div>
      </div>

      <FaixaListaColada ids={listaColada} mostrando={carregando ? undefined : pedidos.length} onLimpar={() => setListaColada(null)} />

      <div className="mb-3 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Buscar por nota, pedido, cliente, embarque, placa ou motorista"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
        <div className="inline-flex rounded-lg border border-surface-border overflow-hidden self-start">
          {([['', 'Todos'], ['com', 'Conferidos'], ['sem', 'Sem conferência']] as [Filtro, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltro(v)}
              className={`px-3 min-h-[44px] text-sm whitespace-nowrap transition-colors ${
                filtro === v ? 'bg-cyan-700 text-white font-semibold' : 'bg-surface-card text-ink-muted hover:bg-surface-elev'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : pedidos.length === 0 ? (
        buscaAtiva ? (
          <div className="py-6 space-y-4">
            <p className="text-ink-subtle text-center">Nada encontrado para “{buscaAtiva}” nesta lista.</p>
            <OndeEsta busca={buscaAtiva} lista="embarcados" />
          </div>
        ) : (
          <p className="text-ink-subtle text-center py-12">
            {filtro ? 'Nenhum documento embarcado com esse filtro.' : 'Nenhum documento embarcado ainda.'}
          </p>
        )
      ) : (
        <>
          <p className="text-xs text-ink-muted mb-2">{pedidos.length} de {count}</p>
          <div className="space-y-3">
            {grupos.map((g, gi) => {
              const cab = g.pedidos[0]
              return (
                <section key={`${g.embarque}-${gi}`} className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
                  <header className="px-4 py-2.5 border-b border-surface-border bg-cyan-50 dark:bg-cyan-500/10 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-ink">Embarque {g.embarque || '—'}</span>
                    {cab.embarque_placa && <span className="font-mono text-sm text-ink">{cab.embarque_placa}</span>}
                    {cab.embarque_motorista && <span className="text-sm text-ink-muted">{cab.embarque_motorista}</span>}
                    {cab.embarcado_em && <span className="text-sm text-ink-muted">saída {dataHora(cab.embarcado_em)}</span>}
                    <span className="ml-auto text-xs text-ink-muted">
                      {g.pedidos.length} {g.pedidos.length === 1 ? 'documento' : 'documentos'}
                    </span>
                  </header>
                  <ul>
                    {g.pedidos.map((p) => {
                      const aberto = expandidos.has(p.id)
                      const detalhe = itensCache[p.id]
                      const foiConferido = p.status_anterior === 'conferido'
                      return (
                        <li key={p.id} className="border-b border-surface-border last:border-b-0">
                          <div className="flex items-start">
                            <button
                              onClick={() => alternarExpansao(p.id)}
                              className="flex-1 min-w-0 px-4 py-3 text-left hover:bg-surface-elev/40 transition-colors"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-ink">{p.numero_externo}</span>
                                    <DocBadges tipo={p.tipo} frete={p.frete} origem={p.pedidos_origem} nfs={p.nfs_documento} />
                                    {p.tipo === 'pedido' && p.nf_numero && (
                                      <span className="text-xs text-ink-subtle" title="Nota fiscal emitida a partir deste pedido">NF {p.nf_numero}</span>
                                    )}
                                    <span className="text-xs bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300 px-2 py-0.5 rounded-full font-medium">
                                      Embarcado
                                    </span>
                                    {!foiConferido && (
                                      <span
                                        className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium"
                                        title="A nota embarcou sem passar pela conferência do Separa"
                                      >
                                        Sem conferência
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-ink-muted truncate">
                                    {p.cliente || '—'}
                                    {p.transportadora && <span className="text-ink-subtle"> · {p.transportadora}</span>}
                                  </p>
                                  <p className="text-xs text-ink-subtle mt-1">
                                    {foiConferido ? (
                                      <>
                                        conferido {dataHora(p.conferido_em)}
                                        {p.conferente_username && <> por <strong className="text-ink">{p.conferente_username}</strong></>}
                                      </>
                                    ) : (
                                      <>estava {p.status_anterior === 'selecionado' ? 'na fila do Pátio (Selecionado)' : 'Pendente em Vendas'}</>
                                    )}
                                    {' · '}{p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                                  </p>
                                </div>
                                <span className={`text-ink-subtle text-sm shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}>▸</span>
                              </div>
                            </button>
                            <div className="pr-3 pt-3 shrink-0 flex flex-col items-end gap-1.5">
                              {foiConferido && (
                                <ImprimirEtiqueta
                                  pedidoId={p.id}
                                  impressaEm={p.etiqueta_volume_em}
                                  bloqueio={p.etiqueta_bloqueio ?? null}
                                  onImpresso={() => atualizarLinha(p.id, { etiqueta_volume_em: new Date().toISOString() })}
                                />
                              )}
                              <HistoricoBotao pedidoId={p.id} />
                              {podeCce && (
                                <TrocarTransportadora
                                  pedidoId={p.id}
                                  onCarregado={(a) => atualizarLinha(a.id, { nf_numero: a.nf_numero, etiqueta_bloqueio: a.etiqueta_bloqueio })}
                                  onAlterado={(a) => atualizarLinha(a.id, {
                                    transportadora: a.transportadora, nf_numero: a.nf_numero,
                                    ...(a.etiqueta_bloqueio !== undefined ? { etiqueta_bloqueio: a.etiqueta_bloqueio } : {}),
                                  })}
                                />
                              )}
                            </div>
                          </div>

                          {aberto && (
                            <div className="bg-cyan-50 dark:bg-cyan-500/10 border-t border-cyan-200 dark:border-cyan-500/30 border-l-4 border-l-cyan-500 pl-6 pr-4 py-3">
                              {carregandoItens.has(p.id) && !detalhe ? (
                                <p className="text-xs text-ink-subtle italic">Carregando itens…</p>
                              ) : (
                                <ItensPorVolume itens={detalhe?.itens ?? []} volumes={detalhe?.volumes ?? []} />
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>

          {proximaPagina && (
            <div className="text-center mt-4">
              <button
                onClick={() => carregar(buscaAtiva, proximaPagina, true)}
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
