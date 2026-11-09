'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { OndeEsta } from '@/components/pedidos/OndeEsta'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supervisorApi, pedidosApi, type Paginado } from '@/lib/api'
import { ImprimirEtiqueta } from '@/components/etiquetas/ImprimirEtiqueta'
import type { BloqueioEtiqueta } from '@/lib/api'
import { HistoricoBotao } from '@/components/pedidos/HistoricoPedido'
import { TrocarTransportadora } from '@/components/cce/TrocarTransportadora'
import { useCcePermissao } from '@/lib/useCcePermissao'
import { ItensPorVolume, type ItemDoc, type VolumeDoc } from '@/components/pedidos/ItensPorVolume'

type Pedido = {
  id: number
  numero_externo: string
  tipo?: string
  frete?: string
  pedidos_origem?: string[]
  nfs_documento?: string[]
  cliente: string
  conferido_em: string | null
  conferente: number | null
  conferente_username: string | null
  separado_por_nome: string | null
  separador_nao_identificado: boolean
  qtd_itens: number
  duracao_conferencia: string | null
  transportadora?: string
  nf_numero?: string
  etiqueta_volume_em?: string | null
  etiqueta_bloqueio?: BloqueioEtiqueta | null
}

// Detalhe carregado ao abrir a linha: itens + volumes (itens por volume desde 2026-11-06)
type Detalhe = { itens: ItemDoc[]; volumes: VolumeDoc[] }

export default function ConferidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  // '' | 'com' | 'sem' — separar o que já pode sair (etiqueta/transporte) do que ainda espera
  // transportadora no Senior (2026-11-09). O ref deixa `carregar` estável (paginação).
  const [transportadora, setTransportadora] = useState<'' | 'com' | 'sem'>('')
  const transportadoraRef = useRef<'' | 'com' | 'sem'>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const podeCce = useCcePermissao() === true   // Corrigir NF só para os perfis em Configuracao.cce_perfis

  // Acordeão: quais estão abertos + cache + estado de loading por pedido
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Detalhe>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarConferidos({
        search, page, transportadora: transportadoraRef.current || undefined,
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

  useEffect(() => { carregar('', 1, false) }, [carregar])

  // Atualiza uma linha no lugar (NF descoberta pelo Corrigir NF, carta gravada, etiqueta impressa)
  // em vez de recarregar a lista — sem "Carregando…" piscando na tela.
  const atualizarLinha = useCallback((id: number, campos: Partial<Pedido>) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...campos } : p)))
  }, [])

  useEffect(() => {
    transportadoraRef.current = transportadora
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(busca)
      carregar(busca, 1, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [busca, transportadora, carregar])

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

      <div className="mb-3 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Buscar por pedido, NF ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
        <FiltroChips
          valor={transportadora}
          onChange={(v) => setTransportadora(v as '' | 'com' | 'sem')}
          opcoes={[['', 'Todos'], ['com', 'Com transportadora'], ['sem', 'Sem transportadora']]}
        />
      </div>

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : pedidos.length === 0 ? (
        buscaAtiva ? (
          <div className="py-6 space-y-4">
            <p className="text-ink-subtle text-center">Nada encontrado para “{buscaAtiva}” nesta lista.</p>
            <OndeEsta busca={buscaAtiva} lista="conferidos" />
          </div>
        ) : (
          <p className="text-ink-subtle text-center py-12">Nenhum pedido conferido.</p>
        )
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
                const detalhe = itensCache[p.id]
                const carregandoEsse = carregandoItens.has(p.id)
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
                            <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                              Conferido
                            </span>
                          </div>
                          <p className="text-sm text-ink-muted truncate">
                            {p.cliente || '—'}
                            {p.transportadora && <span className="text-ink-subtle"> · {p.transportadora}</span>}
                          </p>
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
                    {/* Etiqueta de volume (ponto 7): imprime/reimprime; o backend diz se pode
                        (transportadora e, se configurado, NF emitida) em `etiqueta_bloqueio` */}
                    <div className="pr-3 pt-3 shrink-0 flex flex-col items-end gap-1.5">
                      <ImprimirEtiqueta
                        pedidoId={p.id}
                        impressaEm={p.etiqueta_volume_em}
                        bloqueio={p.etiqueta_bloqueio ?? null}
                        onImpresso={() => atualizarLinha(p.id, { etiqueta_volume_em: new Date().toISOString() })}
                      />
                      <HistoricoBotao pedidoId={p.id} />
                      {/* Carta de correção (ponto 6): transportadora/frete/volumes da NF — NF própria ou a do pedido faturado */}
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
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-500/30 border-l-4 border-l-emerald-400 dark:border-l-emerald-500 pl-6 pr-4 py-3">
                        {carregandoEsse && !detalhe ? (
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

function FiltroChips({
  valor, onChange, opcoes,
}: {
  valor: string
  onChange: (v: string) => void
  opcoes: [string, string][]
}) {
  return (
    <div className="inline-flex rounded-lg border border-surface-border overflow-hidden self-start">
      {opcoes.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`px-3 min-h-[44px] text-sm whitespace-nowrap transition-colors ${
            valor === v
              ? 'bg-emerald-600 text-white font-semibold'
              : 'bg-surface-card text-ink-muted hover:bg-surface-elev'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
