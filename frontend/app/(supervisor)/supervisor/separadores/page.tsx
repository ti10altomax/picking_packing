'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { separadoresApi, SeparadorCadastro } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

const TIPO_LABEL: Record<string, string> = { extra: 'Extra', funcionario: 'Funcionário' }

export default function SeparadoresPage() {
  const dialog = useDialog()
  const [lista, setLista] = useState<SeparadorCadastro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [agindo, setAgindo] = useState<number | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Cadastro rápido
  const [novoNome, setNovoNome] = useState('')
  const [novoApelido, setNovoApelido] = useState('')
  const [novoTipo, setNovoTipo] = useState<'extra' | 'funcionario'>('extra')
  const [cadastrando, setCadastrando] = useState(false)

  const buscaRef = useRef(busca)
  buscaRef.current = busca

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await separadoresApi.listar(buscaRef.current ? { search: buscaRef.current } : {})
      setLista(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Busca server-side com debounce
  useEffect(() => {
    const t = setTimeout(carregar, 300)
    return () => clearTimeout(t)
  }, [busca, carregar])

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    const nome = novoNome.trim()
    if (!nome) return
    setCadastrando(true)
    setMensagem(null)
    try {
      await separadoresApi.criar({ nome, apelido: novoApelido.trim(), tipo: novoTipo })
      setNovoNome('')
      setNovoApelido('')
      setNovoTipo('extra')
      setMensagem({ tipo: 'ok', texto: `${nome} cadastrado` })
      await carregar()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao cadastrar separador' })
    } finally {
      setCadastrando(false)
    }
  }

  async function alternarLiberacao(s: SeparadorCadastro) {
    setAgindo(s.id)
    setMensagem(null)
    try {
      if (s.liberado_hoje) await separadoresApi.desliberar([s.id])
      else await separadoresApi.liberar([s.id])
      setLista((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, liberado_hoje: !s.liberado_hoje } : x))
      )
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao atualizar liberação' })
    } finally {
      setAgindo(null)
    }
  }

  async function alternarAtivo(s: SeparadorCadastro) {
    if (s.ativo) {
      const ok = await dialog.confirm({
        title: 'Desativar separador?',
        message: `${s.apelido || s.nome} não aparecerá mais nas listas. O histórico é mantido.`,
        variant: 'danger',
        confirmText: 'Desativar',
        cancelText: 'Voltar',
      })
      if (!ok) return
    }
    setAgindo(s.id)
    setMensagem(null)
    try {
      const atualizado = await separadoresApi.atualizar(s.id, { ativo: !s.ativo })
      setLista((prev) => prev.map((x) => (x.id === s.id ? atualizado : x)))
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao atualizar separador' })
    } finally {
      setAgindo(null)
    }
  }

  const liberadosHoje = lista.filter((s) => s.ativo && s.liberado_hoje).length

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Separadores</h1>
          <p className="text-sm text-ink-muted">
            Cadastro e liberação do dia · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{liberadosHoje} liberado{liberadosHoje === 1 ? '' : 's'} hoje</span>
          </p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
          Atualizar
        </button>
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

      {/* Cadastro rápido */}
      <form
        onSubmit={cadastrar}
        className="bg-surface-card border border-surface-border rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-end"
      >
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-ink-subtle block mb-1">Nome *</label>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome completo"
            className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex-1 min-w-[110px]">
          <label className="text-xs text-ink-subtle block mb-1">Apelido</label>
          <input
            value={novoApelido}
            onChange={(e) => setNovoApelido(e.target.value)}
            placeholder="Como é chamado"
            className="w-full h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="min-w-[120px]">
          <label className="text-xs text-ink-subtle block mb-1">Tipo</label>
          <select
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as 'extra' | 'funcionario')}
            className="w-full h-11 px-2 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm outline-none"
          >
            <option value="extra">Extra</option>
            <option value="funcionario">Funcionário</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={cadastrando || !novoNome.trim()}
          className="h-11 px-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-lg text-sm font-semibold disabled:opacity-40 transition-opacity"
        >
          Cadastrar
        </button>
      </form>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome, apelido ou documento…"
        className="w-full h-11 px-3 mb-4 rounded-lg bg-surface-card border border-surface-border text-ink text-sm outline-none focus:border-blue-400"
      />

      {carregando && lista.length === 0 ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">Nenhum separador cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <div
              key={s.id}
              className={`bg-surface-card border border-surface-border rounded-xl p-3 flex items-center gap-3 ${
                !s.ativo ? 'opacity-50' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink">{s.apelido || s.nome}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elev text-ink-muted">
                    {TIPO_LABEL[s.tipo] ?? s.tipo}
                  </span>
                  {!s.ativo && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      inativo
                    </span>
                  )}
                </div>
                {s.apelido && <p className="text-xs text-ink-subtle truncate">{s.nome}</p>}
                {s.documento && <p className="text-xs text-ink-subtle">{s.documento}</p>}
              </div>

              {s.ativo && (
                <button
                  onClick={() => alternarLiberacao(s)}
                  disabled={agindo === s.id}
                  className={`h-11 px-4 rounded-lg text-sm font-semibold shrink-0 transition-colors disabled:opacity-50 ${
                    s.liberado_hoje
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'bg-surface-elev text-ink-muted border border-surface-border hover:text-ink'
                  }`}
                >
                  {s.liberado_hoje ? '✓ Liberado hoje' : 'Liberar hoje'}
                </button>
              )}
              <button
                onClick={() => alternarAtivo(s)}
                disabled={agindo === s.id}
                className="h-11 px-3 rounded-lg text-sm text-ink-subtle hover:text-ink shrink-0 transition-colors disabled:opacity-50"
              >
                {s.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
