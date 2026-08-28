'use client'
import { useEffect, useState, useCallback } from 'react'
import { errosApi, type ErroSeparacaoResumo, type ErroSeparacaoItem } from '@/lib/api'

type FiltroTipo = '' | 'a_mais' | 'a_menos'

const TIPO_CHIP: Record<string, { label: string; cor: string }> = {
  a_mais: { label: 'Sobra', cor: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  a_menos: { label: 'Falta', cor: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
}

export default function ErrosSeparacaoPage() {
  const [resumo, setResumo] = useState<ErroSeparacaoResumo[]>([])
  const [erros, setErros] = useState<ErroSeparacaoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tipo, setTipo] = useState<FiltroTipo>('')
  const [separador, setSeparador] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await errosApi.listar({
        ...(tipo ? { tipo } : {}),
        ...(separador ? { separador } : {}),
        ...(dataInicio ? { data_inicio: dataInicio } : {}),
        ...(dataFim ? { data_fim: dataFim } : {}),
      })
      setResumo(data.resumo)
      setErros(data.erros)
    } finally {
      setCarregando(false)
    }
  }, [tipo, separador, dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Erros de separação</h1>
          <p className="text-sm text-ink-muted">
            Sobras e faltas registradas na conferência, por separador
          </p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {([['', 'Tudo'], ['a_mais', 'Sobras'], ['a_menos', 'Faltas']] as [FiltroTipo, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTipo(v)}
            className={`h-10 px-4 rounded-lg text-sm font-medium border transition-colors ${
              tipo === v
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-surface-card text-ink-muted border-surface-border hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="h-10 px-2 rounded-lg bg-surface-card border border-surface-border text-ink text-sm"
        />
        <span className="text-ink-subtle text-sm">até</span>
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="h-10 px-2 rounded-lg bg-surface-card border border-surface-border text-ink text-sm"
        />
        {(dataInicio || dataFim || separador) && (
          <button
            onClick={() => { setDataInicio(''); setDataFim(''); setSeparador('') }}
            className="h-10 px-3 text-sm text-blue-600 dark:text-blue-400"
          >
            limpar
          </button>
        )}
      </div>

      {/* Ranking por separador */}
      <h2 className="text-sm font-bold text-ink mb-2 uppercase tracking-wide">Por separador</h2>
      {resumo.length === 0 ? (
        <p className="text-ink-subtle text-sm mb-6">Nenhum erro registrado no período.</p>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden mb-6">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-surface-border bg-surface-elev/50 text-xs text-ink-muted font-semibold">
            <span>Separador</span>
            <span className="text-right w-16">Sobras</span>
            <span className="text-right w-16">Faltas</span>
            <span className="text-right w-16">Total</span>
          </div>
          {resumo.map((r) => {
            const chave = r.separador_id === null ? 'nao_identificado' : String(r.separador_id)
            const ativo = separador === chave
            return (
              <button
                key={chave}
                onClick={() => setSeparador(ativo ? '' : chave)}
                className={`w-full grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2.5 border-b border-surface-border last:border-b-0 text-left transition-colors ${
                  ativo ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-surface-elev/50'
                }`}
              >
                <span className={`text-sm font-medium truncate ${
                  r.nao_identificado ? 'text-amber-600 dark:text-amber-400' : 'text-ink'
                }`}>
                  {r.nao_identificado ? '⚠ Não identificado' : r.nome}
                </span>
                <span className="text-sm text-right w-16 text-amber-700 dark:text-amber-300">{r.sobras || '—'}</span>
                <span className="text-sm text-right w-16 text-red-700 dark:text-red-300">{r.faltas || '—'}</span>
                <span className="text-sm text-right w-16 font-bold text-ink">{r.total}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Ocorrências */}
      <h2 className="text-sm font-bold text-ink mb-2 uppercase tracking-wide">
        Ocorrências {separador && '(filtradas)'}
      </h2>
      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : erros.length === 0 ? (
        <p className="text-ink-subtle text-sm py-6 text-center">Nenhuma ocorrência com esses filtros.</p>
      ) : (
        <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
          <ul>
            {erros.map((e) => {
              const chip = TIPO_CHIP[e.tipo]
              return (
                <li key={e.id} className="px-4 py-3 border-b border-surface-border last:border-b-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${chip.cor}`}>
                      {chip.label}
                    </span>
                    <span className="text-sm font-bold text-ink">{e.qtd}×</span>
                    <span className="text-sm text-ink truncate">{e.descricao || e.sku || 'item'}</span>
                  </div>
                  <p className="text-xs text-ink-subtle mt-1">
                    pedido {e.numero_externo}
                    {e.separador ? ` · separador: ${e.separador}` : ' · separador não identificado'}
                    {' · '}
                    {new Date(e.criado_em).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                    {e.registrado_por && ` · por ${e.registrado_por}`}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
