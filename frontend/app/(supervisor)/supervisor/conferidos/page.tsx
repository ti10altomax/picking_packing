'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { OndeEsta } from '@/components/pedidos/OndeEsta'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supervisorApi, pedidosApi, impressaoApi, type Paginado, type ImpressoraEtiqueta } from '@/lib/api'
import { ImprimirEtiqueta, escolhaInicial, guardarUltimaImpressora, rotuloBloqueio } from '@/components/etiquetas/ImprimirEtiqueta'
import type { BloqueioEtiqueta } from '@/lib/api'
import { HistoricoBotao } from '@/components/pedidos/HistoricoPedido'
import { TrocarTransportadora } from '@/components/cce/TrocarTransportadora'
import { useCcePermissao } from '@/lib/useCcePermissao'
import { ItensPorVolume, type ItemDoc, type VolumeDoc } from '@/components/pedidos/ItensPorVolume'
import { MoverLancamentos } from '@/components/pedidos/MoverLancamentos'
import { CotacaoBotao } from '@/components/pedidos/CotacaoBotao'
import { ColarListaBotao, FaixaListaColada } from '@/components/pedidos/ListaNotas'
import { useAuthStore } from '@/stores/authStore'
import { useDialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'

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
  em_cotacao?: boolean
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
  // '' | 'nao_impressa' — só o que ainda não teve etiqueta de volume impressa (2026-11-26)
  const [etiqueta, setEtiqueta] = useState<'' | 'nao_impressa'>('')
  const etiquetaRef = useRef<'' | 'nao_impressa'>('')
  // Lista colada (2026-11-26): a tela mostra só essas notas (`?ids=`); null = sem filtro
  const [listaColada, setListaColada] = useState<number[] | null>(null)
  const listaRef = useRef<number[] | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const podeCce = useCcePermissao() === true   // Corrigir NF só para os perfis em Configuracao.cce_perfis
  const { user } = useAuthStore()
  const ehAdmin = user?.perfil === 'admin'     // Devolver para Vendas é só do admin (2026-11-16)
  const podeMover = ehAdmin || user?.perfil === 'supervisor_patio'   // Mover itens entre volumes (2026-11-19)
  const [movendo, setMovendo] = useState<number | null>(null)
  const dialog = useDialog()
  const toast = useToast()
  const [devolvendo, setDevolvendo] = useState<number | null>(null)

  // Acordeão: quais estão abertos + cache + estado de loading por pedido
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Detalhe>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  // Etiquetas em massa (2026-11-26): marca os documentos e manda todos para uma impressora.
  // Só entra quem pode imprimir (sem `etiqueta_bloqueio`); a seleção vale para a lista na tela.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [impressoras, setImpressoras] = useState<ImpressoraEtiqueta[]>([])
  const [destino, setDestino] = useState<number | 'navegador'>('navegador')
  const [lote, setLote] = useState<{ total: number; feitas: number } | null>(null)

  useEffect(() => {
    impressaoApi.impressoras()
      .then((i) => { setImpressoras(i.impressoras); setDestino(escolhaInicial(i.impressoras)) })
      .catch(() => { /* sem a lista, sobra o navegador */ })
  }, [])

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    if (!append) setSelecionados(new Set())   // lista nova (busca, filtro, Atualizar): a seleção antiga não vale
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarConferidos({
        search, page, transportadora: transportadoraRef.current || undefined,
        etiqueta: etiquetaRef.current || undefined,
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

  useEffect(() => { carregar('', 1, false) }, [carregar])

  // Atualiza uma linha no lugar (NF descoberta pelo Corrigir NF, carta gravada, etiqueta impressa)
  // em vez de recarregar a lista — sem "Carregando…" piscando na tela.
  const atualizarLinha = useCallback((id: number, campos: Partial<Pedido>) => {
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...campos } : p)))
  }, [])

  useEffect(() => {
    transportadoraRef.current = transportadora
    etiquetaRef.current = etiqueta
    listaRef.current = listaColada
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(busca)
      carregar(busca, 1, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [busca, transportadora, etiqueta, listaColada, carregar])

  async function carregarMais() {
    if (proximaPagina) await carregar(buscaAtiva, proximaPagina, true)
  }

  // Conferência que não vale (teste, documento errado): volta a Pendente do zero —
  // volumes apagados, separado zerado, etiqueta esquecida. Só admin; sempre confirmado.
  async function devolver(p: Pedido) {
    const ok = await dialog.confirm({
      title: 'Devolver para Vendas?',
      message: `${p.tipo === 'nota_fiscal' ? 'A NF' : 'O pedido'} ${p.numero_externo} volta a Pendente como se nunca tivesse sido conferido: os volumes são apagados, as quantidades zeradas e a etiqueta terá que sair de novo. O histórico fica guardado.`,
      variant: 'danger',
      confirmText: 'Devolver',
    })
    if (!ok) return
    setDevolvendo(p.id)
    try {
      await supervisorApi.devolverConferido(p.id)
      toast.ok(`${p.numero_externo} voltou para Vendas`, { detalhe: 'Está em Pendente, sem volumes.' })
      setPedidos((prev) => prev.filter((x) => x.id !== p.id))
      setCount((c) => Math.max(0, c - 1))
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      toast.erro('Não deu para devolver', { detalhe: msg })
    } finally {
      setDevolvendo(null)
    }
  }

  function alternarSelecao(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const imprimiveis = pedidos.filter((p) => !p.etiqueta_bloqueio)
  const marcados = imprimiveis.filter((p) => selecionados.has(p.id))
  const todosMarcados = imprimiveis.length > 0 && marcados.length === imprimiveis.length

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(imprimiveis.map((p) => p.id)))
  }

  async function imprimirSelecionadas() {
    const alvo = marcados
    if (!alvo.length || lote) return
    if (destino === 'navegador') {
      // Navegador: uma aba por documento — o usuário imprime cada uma
      alvo.forEach((p) => window.open(`/etiquetas/${p.id}`, '_blank', 'noopener'))
      setSelecionados(new Set())
      return
    }
    const nome = impressoras.find((i) => i.id === destino)?.nome ?? 'impressora'
    const jaImpressas = alvo.filter((p) => p.etiqueta_volume_em).length
    const ok = await dialog.confirm({
      title: `Imprimir as etiquetas de ${alvo.length} documento${alvo.length === 1 ? '' : 's'}?`,
      message: `Impressora: ${nome}.${
        jaImpressas ? ` ${jaImpressas} já ${jaImpressas === 1 ? 'teve' : 'tiveram'} etiqueta impressa e ${jaImpressas === 1 ? 'será reimpresso' : 'serão reimpressos'}.` : ''
      }`,
      confirmText: 'Imprimir',
      cancelText: 'Voltar',
    })
    if (!ok) return
    guardarUltimaImpressora(String(destino))
    setLote({ total: alvo.length, feitas: 0 })
    const erros: string[] = []
    for (const p of alvo) {
      try {
        await impressaoApi.imprimir(p.id, { impressora_id: destino })
        atualizarLinha(p.id, { etiqueta_volume_em: new Date().toISOString() })
        setSelecionados((prev) => { const next = new Set(prev); next.delete(p.id); return next })
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro ?? 'falha'
        erros.push(`${p.numero_externo}: ${msg}`)
      }
      setLote((l) => l && { ...l, feitas: l.feitas + 1 })
    }
    setLote(null)
    const feitas = alvo.length - erros.length
    if (feitas) toast.ok(`Etiquetas de ${feitas} documento${feitas === 1 ? '' : 's'} enviadas`, { detalhe: `Impressora: ${nome}` })
    // quem falhou continua marcado para tentar de novo
    if (erros.length) toast.erro(`${erros.length} não ${erros.length === 1 ? 'saiu' : 'saíram'}`, { detalhe: erros.join(' · '), duracao: 15000 })
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
    <div className={`p-4 ${marcados.length > 0 ? 'pb-28' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pedidos conferidos</h1>
          <p className="text-sm text-ink-muted">Concluídos pelos conferentes</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Relatório para imprimir: o que ainda precisa de transportadora para a etiqueta sair (2026-11-23) */}
          <Link
            href="/supervisor/conferidos/sem-transportadora"
            className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2"
          >
            Relatório sem transportadora
          </Link>
          <ColarListaBotao nomeTela="Conferidos" naTela={(d) => d.lista === 'conferidos'} onFiltrar={setListaColada} />
          <button onClick={() => carregar(buscaAtiva, 1, false)} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
            Atualizar
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-col sm:flex-row sm:flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar por pedido, NF ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="flex-1 sm:min-w-[240px] bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
        <FiltroChips
          valor={transportadora}
          onChange={(v) => setTransportadora(v as '' | 'com' | 'sem')}
          opcoes={[['', 'Todos'], ['com', 'Com transportadora'], ['sem', 'Sem transportadora']]}
        />
        <FiltroChips
          valor={etiqueta}
          onChange={(v) => setEtiqueta(v as '' | 'nao_impressa')}
          opcoes={[['', 'Etiqueta: todas'], ['nao_impressa', 'Etiqueta não impressa']]}
        />
      </div>

      <FaixaListaColada ids={listaColada} mostrando={carregando ? undefined : pedidos.length} onLimpar={() => setListaColada(null)} />

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
              <label className="inline-flex items-center gap-3 min-h-[32px] cursor-pointer" title="Marca todos os documentos da lista que podem ter etiqueta">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  disabled={imprimiveis.length === 0 || !!lote}
                  className="w-5 h-5 accent-emerald-600"
                />
                <span>Marcar todos para etiqueta</span>
              </label>
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
                    {/* Seleção para a impressão em massa — desabilitada quando a etiqueta está bloqueada */}
                    <label
                      className={`pl-4 pr-1 pt-3 min-h-[44px] shrink-0 flex items-start ${p.etiqueta_bloqueio ? 'opacity-40' : 'cursor-pointer'}`}
                      title={p.etiqueta_bloqueio ? `Etiqueta indisponível: ${rotuloBloqueio(p.etiqueta_bloqueio)}` : 'Marcar para imprimir a etiqueta'}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Marcar ${p.numero_externo} para etiqueta`}
                        checked={selecionados.has(p.id) && !p.etiqueta_bloqueio}
                        onChange={() => alternarSelecao(p.id)}
                        disabled={!!p.etiqueta_bloqueio || !!lote}
                        className="w-5 h-5 mt-0.5 accent-emerald-600"
                      />
                    </label>
                    <button
                      onClick={() => alternarExpansao(p.id)}
                      className="flex-1 min-w-0 pl-2 pr-4 py-3 text-left hover:bg-surface-elev/40 transition-colors"
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
                      {/* Em cotação de frete (2026-11-26): segura a etiqueta até a transportadora mudar */}
                      <CotacaoBotao
                        pedidoId={p.id}
                        numero={p.numero_externo}
                        emCotacao={!!p.em_cotacao}
                        onMudou={(r) => atualizarLinha(p.id, { em_cotacao: r.em_cotacao, etiqueta_bloqueio: r.etiqueta_bloqueio })}
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
                            // a troca da transportadora tira a nota de cotação no servidor
                            ...(a.etiqueta_bloqueio !== undefined && a.etiqueta_bloqueio?.codigo !== 'em_cotacao' ? { em_cotacao: false } : {}),
                          })}
                        />
                      )}
                      {ehAdmin && (
                        <button
                          type="button"
                          onClick={() => devolver(p)}
                          disabled={devolvendo === p.id}
                          title="Volta o documento para Pendente (tela de Vendas), apagando volumes e quantidades"
                          className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 rounded-lg px-2 min-h-[32px] hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
                          </svg>
                          {devolvendo === p.id ? 'Devolvendo…' : 'Devolver para Vendas'}
                        </button>
                      )}
                    </div>
                    </div>

                    {aberto && (
                      <div className="bg-emerald-50 dark:bg-emerald-500/10 border-t border-emerald-200 dark:border-emerald-500/30 border-l-4 border-l-emerald-400 dark:border-l-emerald-500 pl-6 pr-4 py-3">
                        {carregandoEsse && !detalhe ? (
                          <p className="text-xs text-ink-subtle italic">Carregando itens…</p>
                        ) : (
                          <>
                            <ItensPorVolume itens={detalhe?.itens ?? []} volumes={detalhe?.volumes ?? []} />
                            {podeMover && detalhe && detalhe.volumes.some((v) => !v.op && v.itens.length > 0) && (
                              <button
                                type="button"
                                onClick={() => setMovendo(p.id)}
                                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink border border-surface-border rounded-lg px-3 min-h-[36px] bg-surface-card hover:bg-surface-elev transition-colors"
                                title="Esqueceram de abrir um volume? Mova lançamentos para outro volume ou para um volume novo"
                              >
                                ⇄ Mover itens entre volumes
                              </button>
                            )}
                            {movendo === p.id && detalhe && (
                              <MoverLancamentos
                                pedidoId={p.id}
                                numero={p.numero_externo}
                                itens={detalhe.itens}
                                volumes={detalhe.volumes}
                                onFechar={() => setMovendo(null)}
                                onMovido={(r) => {
                                  setMovendo(null)
                                  setItensCache((prev) => ({ ...prev, [p.id]: { itens: prev[p.id]?.itens ?? [], volumes: r.volumes ?? [] } }))
                                  atualizarLinha(p.id, { etiqueta_bloqueio: r.etiqueta_bloqueio ?? null })
                                }}
                              />
                            )}
                          </>
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

      {/* Barra da impressão em massa: aparece com pelo menos um documento marcado */}
      {marcados.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-surface-card border-t border-surface-border shadow-[0_-4px_16px_rgba(0,0,0,0.12)] print:hidden">
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            <p className="text-sm text-ink mr-auto">
              <strong>{marcados.length}</strong> marcado{marcados.length === 1 ? '' : 's'} para etiqueta
              {lote && <span className="text-ink-muted"> · enviando {lote.feitas}/{lote.total}…</span>}
            </p>
            <select
              value={String(destino)}
              onChange={(e) => setDestino(e.target.value === 'navegador' ? 'navegador' : Number(e.target.value))}
              disabled={!!lote}
              aria-label="Impressora"
              className="bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[44px] text-sm"
            >
              {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.padrao ? ' (padrão)' : ''}</option>)}
              <option value="navegador">Navegador</option>
            </select>
            <button
              type="button"
              onClick={imprimirSelecionadas}
              disabled={!!lote}
              className="bg-emerald-600 text-white px-4 min-h-[44px] rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Imprimir etiquetas
            </button>
            <button
              type="button"
              onClick={() => setSelecionados(new Set())}
              disabled={!!lote}
              className="text-sm text-ink-muted min-h-[44px] px-2 disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>
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
