'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supervisorApi, sequenciasApi, type Paginado, type SequenciaResumo } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  criado_em: string
  selecionado_em: string | null
  qtd_itens: number
  tempo_espera: string
}

const STATUS_SEQ: Record<string, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  em_andamento: { label: 'Em andamento', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  concluida: { label: 'Concluída', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

export default function SupervisorPatioPage() {
  const router = useRouter()
  const [sequencias, setSequencias] = useState<SequenciaResumo[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [destino, setDestino] = useState<'nova' | number>('nova')
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inicializadoRef = useRef(false)

  const carregarSequencias = useCallback(async () => {
    try {
      setSequencias(await sequenciasApi.listar())
    } catch {
      /* lista de sequências é secundária — não bloqueia a página */
    }
  }, [])

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarSelecionados({
        search, page, sem_sequencia: '1',
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

  useEffect(() => {
    (async () => {
      inicializadoRef.current = true
      await Promise.all([carregarSequencias(), carregar('', 1, false)])
    })()
  }, [carregar, carregarSequencias])

  useEffect(() => {
    if (!inicializadoRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setBuscaAtiva(busca)
      carregar(busca, 1, false)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [busca, carregar])

  function toggle(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selecionarTodosVisiveis() {
    if (selecionados.size === pedidos.length) setSelecionados(new Set())
    else setSelecionados(new Set(pedidos.map((p) => p.id)))
  }

  async function carregarMais() {
    if (proximaPagina) await carregar(buscaAtiva, proximaPagina, true)
  }

  async function enviarParaSequencia() {
    if (selecionados.size === 0) return
    setEnviando(true)
    setMensagem(null)
    const ids = Array.from(selecionados)
    try {
      if (destino === 'nova') {
        const seq = await sequenciasApi.criar(ids)
        setSelecionados(new Set())
        router.push(`/supervisor/patio/${seq.id}`)
        return
      }
      const res = await sequenciasApi.adicionar(destino, ids)
      setSelecionados(new Set())
      setMensagem({
        tipo: 'ok',
        texto: `${res.adicionados.length} pedido(s) adicionados à sequência${
          res.ignorados.length ? ` · ${res.ignorados.length} ignorado(s)` : ''
        }`,
      })
      await Promise.all([carregarSequencias(), carregar(buscaAtiva, 1, false)])
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao montar a sequência' })
    } finally {
      setEnviando(false)
    }
  }

  const todosMarcadosNaPagina = pedidos.length > 0 && selecionados.size >= pedidos.length
  const sequenciasAbertas = sequencias.filter((s) => s.status !== 'concluida')

  return (
    <div className="max-w-5xl mx-auto p-4 pb-32">
      {/* ------------------------------------------------------------ */}
      {/* Sequências em aberto                                          */}
      {/* ------------------------------------------------------------ */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Sequências</h1>
          <p className="text-sm text-ink-muted">Monte sequências e atribua os pedidos dentro delas</p>
        </div>
        <button
          onClick={() => { carregarSequencias(); carregar(buscaAtiva, 1, false) }}
          className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2"
        >
          Atualizar
        </button>
      </div>

      {sequenciasAbertas.length === 0 ? (
        <p className="text-sm text-ink-subtle bg-surface-card border border-surface-border rounded-xl p-4 mb-6">
          Nenhuma sequência em aberto — selecione pedidos abaixo e crie a primeira.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {sequenciasAbertas.map((s) => {
            const st = STATUS_SEQ[s.status] ?? STATUS_SEQ.aberta
            return (
              <button
                key={s.id}
                onClick={() => router.push(`/supervisor/patio/${s.id}`)}
                className="bg-surface-card border border-surface-border rounded-xl p-4 text-left hover:border-amber-400 dark:hover:border-amber-500/60 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-ink">Sequência {s.numero}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>{st.label}</span>
                </div>
                <p className="text-sm text-ink-muted">
                  {s.qtd_pedidos} pedido(s) · {s.qtd_sem_conferente} sem conferente · {s.qtd_finalizados} finalizado(s)
                </p>
              </button>
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Selecionados sem sequência                                    */}
      {/* ------------------------------------------------------------ */}
      <h2 className="text-lg font-bold text-ink mb-2">Pedidos aguardando sequência</h2>

      <input
        type="text"
        placeholder="Buscar por número ou cliente"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] mb-3 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
      />

      {mensagem && (
        <div
          className={`mb-3 p-3 rounded-lg text-sm ${
            mensagem.tipo === 'ok'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
              : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300 border border-red-200 dark:border-red-500/30'
          }`}
        >
          {mensagem.texto}
        </div>
      )}

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : pedidos.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">Nenhum pedido aguardando sequência.</p>
      ) : (
        <>
          <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
            <div className="px-4 py-2 border-b border-surface-border bg-surface-elev/50 flex items-center gap-3 text-xs text-ink-muted font-medium">
              <input
                type="checkbox"
                checked={todosMarcadosNaPagina}
                onChange={selecionarTodosVisiveis}
                className="w-5 h-5 accent-amber-500"
              />
              <span>Pedido</span>
              <span className="ml-auto">{pedidos.length} de {count}</span>
            </div>
            <ul>
              {pedidos.map((p) => {
                const marcado = selecionados.has(p.id)
                return (
                  <li
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-surface-border last:border-b-0 cursor-pointer transition-colors ${
                      marcado ? 'bg-amber-50 dark:bg-amber-500/10' : 'hover:bg-surface-elev/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => toggle(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 accent-amber-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink">{p.numero_externo}</span>
                        <span className="text-xs text-ink-subtle">{p.tempo_espera}</span>
                      </div>
                      <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                    </div>
                    <span className="text-xs text-ink-muted whitespace-nowrap">
                      {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                    </span>
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

      {selecionados.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border shadow-lg dark:shadow-2xl dark:shadow-black/40 px-4 py-3 z-20">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-muted">{selecionados.size} pedido(s) →</span>
              <select
                value={destino === 'nova' ? 'nova' : String(destino)}
                onChange={(e) => setDestino(e.target.value === 'nova' ? 'nova' : Number(e.target.value))}
                className="bg-surface-elev border border-surface-border text-ink rounded-lg px-2 py-2 text-sm min-h-[40px]"
              >
                <option value="nova">Nova sequência</option>
                {sequenciasAbertas.map((s) => (
                  <option key={s.id} value={s.id}>Sequência {s.numero}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelecionados(new Set())}
                className="text-sm text-ink-muted hover:text-ink px-3 py-2 min-h-[44px] transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={enviarParaSequencia}
                disabled={enviando}
                className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-50 shadow-lg shadow-amber-500/30 transition-all"
              >
                {enviando
                  ? 'Enviando…'
                  : destino === 'nova' ? 'Criar sequência' : 'Adicionar à sequência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
