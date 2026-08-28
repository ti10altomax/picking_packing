'use client'
import { useEffect, useState, useCallback } from 'react'
import { supervisorApi, pedidosApi } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

type NaoConforme = {
  id: number
  numero_externo: string
  cliente: string
  criado_em: string
  nao_conforme_em: string
  motivo: string
  motivo_label: string
  detalhe: string
  conferente: string | null
  atribuido_por: string | null
  separado_por: string | null
  separador_nao_identificado: boolean
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

const COR_MOTIVO: Record<string, string> = {
  divergencia_qtd: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  produto_errado: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  item_ausente: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300',
}

export default function NaoConformesPage() {
  const dialog = useDialog()
  const [lista, setLista] = useState<NaoConforme[]>([])
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState<number | null>(null)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  // Acordeão
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [itensCache, setItensCache] = useState<Record<number, Item[]>>({})
  const [carregandoItens, setCarregandoItens] = useState<Set<number>>(new Set())

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await supervisorApi.listarNaoConformes()
      setLista(data)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

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

  async function cancelar(p: NaoConforme) {
    const ok = await dialog.confirm({
      title: 'Cancelar pedido?',
      message: `O pedido ${p.numero_externo} será cancelado definitivamente.`,
      variant: 'danger',
      confirmText: 'Cancelar pedido',
      cancelText: 'Voltar',
    })
    if (!ok) return
    setAgindo(p.id)
    setMensagem(null)
    try {
      await supervisorApi.cancelarNaoConforme(p.id)
      setMensagem({ tipo: 'ok', texto: `Pedido ${p.numero_externo} cancelado` })
      await carregar()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao cancelar' })
    } finally {
      setAgindo(null)
    }
  }

  async function retornar(p: NaoConforme) {
    const ok = await dialog.confirm({
      title: 'Retornar para fila?',
      message: `O pedido ${p.numero_externo} voltará a ficar pendente.`,
      variant: 'info',
      confirmText: 'Retornar',
    })
    if (!ok) return
    setAgindo(p.id)
    setMensagem(null)
    try {
      await supervisorApi.retornarNaoConforme(p.id)
      setMensagem({ tipo: 'ok', texto: `Pedido ${p.numero_externo} voltou para Pendente` })
      await carregar()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao retornar para fila' })
    } finally {
      setAgindo(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Não conformes</h1>
          <p className="text-sm text-ink-muted">
            Pedidos com problema na conferência aguardando ação
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

      {carregando ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">
          Nenhum pedido não conforme.
        </p>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => {
            const aberto = expandidos.has(p.id)
            const itens = itensCache[p.id]
            const carregandoEsse = carregandoItens.has(p.id)
            return (
              <div key={p.id} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <button
                  onClick={() => alternarExpansao(p.id)}
                  className="w-full text-left p-4 hover:bg-surface-elev/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-ink">{p.numero_externo}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            COR_MOTIVO[p.motivo] ?? 'bg-surface-elev text-ink-muted'
                          }`}
                        >
                          {p.motivo_label}
                        </span>
                      </div>
                      <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                      <p className="text-xs text-ink-subtle mt-1">
                        Marcado em{' '}
                        {new Date(p.nao_conforme_em).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                        {p.conferente && ` · conferente: ${p.conferente}`}
                        {p.separado_por && ` · separado por: ${p.separado_por}`}
                      </p>
                      {p.separador_nao_identificado && (
                        <p className="text-xs mt-1">
                          <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 px-2 py-0.5 rounded-full font-medium">
                            ⚠ Separador não identificado
                          </span>
                        </p>
                      )}
                      {p.detalhe && (
                        <p className="text-sm text-ink mt-2 p-2 bg-surface-elev rounded-lg italic">
                          "{p.detalhe}"
                        </p>
                      )}
                    </div>
                    <span className={`text-ink-subtle text-sm shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`}>
                      ▸
                    </span>
                  </div>
                </button>

                {aberto && (
                  <div className="bg-surface-elev/30 border-t border-surface-border px-4 py-3">
                    {carregandoEsse && !itens ? (
                      <p className="text-xs text-ink-subtle italic">Carregando itens…</p>
                    ) : !itens || itens.length === 0 ? (
                      <p className="text-xs text-ink-subtle italic">Sem itens registrados.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {itens.map((item) => {
                          const completo = item.status !== 'ok' || item.qtd_separada >= item.qtd_pedida
                          const divergente = item.status === 'ok' && item.qtd_separada !== item.qtd_pedida
                          return (
                            <li
                              key={item.id}
                              className={`flex items-start gap-3 p-2 rounded-lg ${
                                item.status === 'cancelado' ? 'bg-surface-elev/60 opacity-60' :
                                item.status === 'falta' ? 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30' :
                                divergente ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30' :
                                'bg-surface-card'
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
                                  <span className={`text-sm font-bold ${
                                    completo ? 'text-emerald-600 dark:text-emerald-400' :
                                    divergente ? 'text-amber-600 dark:text-amber-400' :
                                    'text-ink'
                                  }`}>
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

                <div className="flex gap-2 px-4 py-3 border-t border-surface-border">
                  <button
                    onClick={() => retornar(p)}
                    disabled={agindo === p.id}
                    className="flex-1 h-10 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    Retornar para fila
                  </button>
                  <button
                    onClick={() => cancelar(p)}
                    disabled={agindo === p.id}
                    className="flex-1 h-10 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    Cancelar pedido
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
