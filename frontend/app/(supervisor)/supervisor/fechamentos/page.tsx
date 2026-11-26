'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback } from 'react'
import { fechamentosApi, pedidosApi, type Fechamento } from '@/lib/api'
import { useDialog } from '@/components/Dialog'
import { MoverLancamentos } from '@/components/pedidos/MoverLancamentos'
import type { ItemDoc, VolumeDoc } from '@/components/pedidos/ItensPorVolume'
import { ColarListaBotao, FaixaListaColada } from '@/components/pedidos/ListaNotas'

export default function FechamentosPage() {
  const dialog = useDialog()
  // Lista colada (2026-11-26): a tela mostra só essas notas; null = sem filtro
  const [listaTodos, setLista] = useState<Fechamento[]>([])
  const [listaColada, setListaColada] = useState<number[] | null>(null)
  const lista = listaColada ? listaTodos.filter((p) => listaColada.includes(p.id)) : listaTodos
  const [carregando, setCarregando] = useState(true)
  const [agindo, setAgindo] = useState<number | null>(null)
  // Mover itens entre volumes antes de fechar (2026-11-19): o conferente esqueceu de abrir volume
  const [movendo, setMovendo] = useState<{ id: number; numero: string; itens: ItemDoc[]; volumes: VolumeDoc[] } | null>(null)
  const [carregandoVolumes, setCarregandoVolumes] = useState<number | null>(null)

  async function abrirMover(p: Fechamento) {
    setCarregandoVolumes(p.id)
    try {
      const d = await pedidosApi.buscar(p.id)
      setMovendo({ id: p.id, numero: p.numero_externo, itens: d.itens ?? [], volumes: d.volumes ?? [] })
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível carregar os volumes.' })
    } finally {
      setCarregandoVolumes(null)
    }
  }

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
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Fechamentos</h1>
          <p className="text-sm text-ink-muted">
            Pedidos concluídos com <strong>sobra</strong> aguardando o fechamento do Sup. Pátio
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ColarListaBotao nomeTela="Fechamentos" naTela={(d) => d.lista === 'fechamentos'} onFiltrar={setListaColada} />
          <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
            Atualizar
          </button>
        </div>
      </div>

      <FaixaListaColada ids={listaColada} mostrando={carregando ? undefined : lista.length} onLimpar={() => setListaColada(null)} />

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
                    <DocBadges tipo={p.tipo} />
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

              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => abrirMover(p)}
                  disabled={carregandoVolumes === p.id}
                  className="sm:w-auto h-11 px-4 rounded-lg border border-surface-border text-sm font-semibold text-ink hover:bg-surface-elev disabled:opacity-50"
                  title="Esqueceram de abrir um volume? Mova lançamentos antes de fechar"
                >
                  {carregandoVolumes === p.id ? 'Carregando…' : '⇄ Mover itens entre volumes'}
                </button>
                <button
                  onClick={() => fechar(p)}
                  disabled={agindo === p.id}
                  className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 shadow-lg shadow-emerald-600/30 transition-all"
                >
                  {agindo === p.id ? 'Fechando…' : 'Fechar e enviar ao Senior'}
                </button>
              </div>
              {movendo?.id === p.id && (
                <MoverLancamentos
                  pedidoId={p.id}
                  numero={p.numero_externo}
                  itens={movendo.itens}
                  volumes={movendo.volumes}
                  onFechar={() => setMovendo(null)}
                  onMovido={() => setMovendo(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
