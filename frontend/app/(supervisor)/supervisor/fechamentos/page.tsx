'use client'
import { useEffect, useState, useCallback } from 'react'
import { fechamentosApi, type Fechamento } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

export default function FechamentosPage() {
  const dialog = useDialog()
  const [lista, setLista] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setLista(await fechamentosApi.listar())
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function fechar(p: Fechamento) {
    const ok = await dialog.confirm({
      title: 'Fechar pedido com sobra?',
      message: `O pedido ${p.numero_externo} será marcado como Conferido e enviado ao Senior.`,
      variant: 'success',
      confirmText: 'Fechar',
    })
    if (!ok) return
    setAgindo(p.id)
    try {
      await fechamentosApi.fechar(p.id)
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      await dialog.alert({ variant: 'danger', title: 'Erro', message: msg ?? 'Não foi possível fechar.' })
    } finally {
      setAgindo(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Fechamentos</h1>
          <p className="text-sm text-ink-muted">
            Pedidos concluídos com <strong>sobra</strong> aguardando o fechamento do Sup. Pátio
          </p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
          Atualizar
        </button>
      </div>

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">Nenhum pedido aguardando fechamento.</p>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => (
            <div key={p.id} className="bg-surface-card border border-violet-300 dark:border-violet-500/40 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink">{p.numero_externo}</span>
                    {p.sequencia_numero && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 font-medium">
                        Seq. {p.sequencia_numero}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 font-medium">
                      Aguardando fechamento
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                  <p className="text-xs text-ink-subtle mt-1">
                    {p.conferente && `conferente: ${p.conferente}`}
                    {p.separado_por && ` · separado por: ${p.separado_por}`}
                    {p.separador_nao_identificado && ' · separador não identificado'}
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3 mt-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Sobras registradas</p>
                <ul className="space-y-0.5">
                  {p.sobras.map((s, i) => (
                    <li key={i} className="text-sm text-ink">
                      <span className="font-bold">{s.qtd}×</span> {s.descricao || s.sku || 'item'}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => fechar(p)}
                disabled={agindo === p.id}
                className="mt-3 w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-lg shadow-emerald-600/30 transition-all"
              >
                {agindo === p.id ? 'Fechando…' : 'Fechar e enviar ao Senior'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
