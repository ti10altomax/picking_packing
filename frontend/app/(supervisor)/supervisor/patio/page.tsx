'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supervisorApi, type Paginado } from '@/lib/api'

type Pedido = {
  id: number
  numero_externo: string
  cliente: string
  criado_em: string
  selecionado_em: string | null
  qtd_itens: number
  tempo_espera: string
}

type Separador = {
  id: number
  username: string
  first_name: string
  last_name: string
}

export default function SupervisorPatioPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [separadores, setSeparadores] = useState<Separador[]>([])
  const [count, setCount] = useState(0)
  const [proximaPagina, setProximaPagina] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [separadorId, setSeparadorId] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inicializadoRef = useRef(false)

  const carregar = useCallback(async (search: string, page = 1, append = false) => {
    if (page === 1) setCarregando(true)
    else setCarregandoMais(true)
    try {
      const data: Paginado<Pedido> | Pedido[] = await supervisorApi.listarSelecionados({ search, page })
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
      const seps: Separador[] = await supervisorApi.listarSeparadores()
      setSeparadores(seps)
      if (seps.length > 0) setSeparadorId(seps[0].id)
      inicializadoRef.current = true
      await carregar('', 1, false)
    })()
  }, [carregar])

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
    if (selecionados.size === pedidos.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(pedidos.map((p) => p.id)))
    }
  }

  async function carregarMais() {
    if (proximaPagina) await carregar(buscaAtiva, proximaPagina, true)
  }

  async function atribuir() {
    if (selecionados.size === 0 || !separadorId) return
    setEnviando(true)
    setMensagem(null)
    try {
      const ids = Array.from(selecionados)
      const res = await supervisorApi.atribuir(ids, separadorId)
      setSelecionados(new Set())
      setMensagem({
        tipo: 'ok',
        texto: `${res.atribuidos.length} pedido(s) atribuído(s) a ${res.separador}${
          res.ignorados.length ? ` · ${res.ignorados.length} ignorado(s)` : ''
        }`,
      })
      await carregar(buscaAtiva, 1, false)
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao atribuir pedidos' })
    } finally {
      setEnviando(false)
    }
  }

  const todosMarcadosNaPagina = pedidos.length > 0 && selecionados.size >= pedidos.length
  const separadorAtual = separadores.find((s) => s.id === separadorId)

  return (
    <div className="max-w-5xl mx-auto p-4 pb-32">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Pedidos selecionados</h1>
          <p className="text-sm text-ink-muted">Atribua os pedidos a um separador</p>
        </div>
        <button onClick={() => carregar(buscaAtiva, 1, false)} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <input
          type="text"
          placeholder="Buscar por número ou cliente"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
        <select
          value={separadorId ?? ''}
          onChange={(e) => setSeparadorId(Number(e.target.value))}
          className="w-full bg-surface-card border border-surface-border text-ink rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        >
          {separadores.length === 0 && <option value="">Nenhum separador disponível</option>}
          {separadores.map((s) => {
            const nome = (s.first_name || s.last_name)
              ? `${s.first_name} ${s.last_name}`.trim()
              : s.username
            return (
              <option key={s.id} value={s.id}>
                {nome} ({s.username})
              </option>
            )
          })}
        </select>
      </div>

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
        <p className="text-ink-subtle text-center py-12">Nenhum pedido aguardando atribuição.</p>
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
                      marcado
                        ? 'bg-amber-50 dark:bg-amber-500/10'
                        : 'hover:bg-surface-elev/60'
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
            <span className="text-sm text-ink-muted">
              {selecionados.size} pedido(s) → <strong className="text-ink">{separadorAtual?.username ?? '—'}</strong>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelecionados(new Set())}
                className="text-sm text-ink-muted hover:text-ink px-3 py-2 min-h-[44px] transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={atribuir}
                disabled={enviando || !separadorId}
                className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-50 shadow-lg shadow-amber-500/30 transition-all"
              >
                {enviando ? 'Atribuindo…' : 'Atribuir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
