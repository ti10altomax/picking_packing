'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  supervisorApi, sequenciasApi,
  type SequenciaResumo, type SequenciaPedido,
} from '@/lib/api'
import { useDialog } from '@/components/Dialog'

type Conferente = { id: number; username: string; first_name: string; last_name: string }
type Detalhe = SequenciaResumo & { pedidos: SequenciaPedido[] }

const STATUS_PEDIDO: Record<string, { label: string; cor: string }> = {
  selecionado: { label: 'Sem conferente', cor: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  atribuido: { label: 'Atribuído', cor: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  conferindo: { label: 'Em conferência', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  aguardando_fechamento: { label: 'Aguard. fechamento', cor: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  conferido: { label: 'Conferido', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  nao_conforme: { label: 'Não conforme', cor: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  cancelado: { label: 'Cancelado', cor: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400' },
}

const STATUS_SEQ: Record<string, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  em_andamento: { label: 'Em andamento', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  concluida: { label: 'Concluída', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

// Pedido ainda "mexível" pelo pátio (atribuir/reatribuir/remover)
const EDITAVEIS = ['selecionado', 'atribuido']

export default function SequenciaDetalhePage() {
  const router = useRouter()
  const params = useParams()
  const sequenciaId = Number(params.id)
  const dialog = useDialog()

  const [seq, setSeq] = useState<Detalhe | null>(null)
  const [conferentes, setConferentes] = useState<Conferente[]>([])
  const [conferenteId, setConferenteId] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [agindo, setAgindo] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const data = await sequenciasApi.detalhe(sequenciaId)
      setSeq(data)
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao carregar a sequência' })
    } finally {
      setCarregando(false)
    }
  }, [sequenciaId])

  useEffect(() => {
    (async () => {
      const lista: Conferente[] = await supervisorApi.listarConferentes()
      setConferentes(lista)
      if (lista.length > 0) setConferenteId(lista[0].id)
      await carregar()
    })()
  }, [carregar])

  function toggle(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function atribuir() {
    if (selecionados.size === 0 || !conferenteId) return
    setAgindo(true)
    setMensagem(null)
    try {
      const res = await sequenciasApi.atribuir(sequenciaId, Array.from(selecionados), conferenteId)
      setSelecionados(new Set())
      setMensagem({
        tipo: 'ok',
        texto: `${res.atribuidos.length} pedido(s) atribuído(s) a ${res.conferente}${
          res.ignorados.length ? ` · ${res.ignorados.length} ignorado(s)` : ''
        }`,
      })
      await carregar()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao atribuir' })
    } finally {
      setAgindo(false)
    }
  }

  async function remover() {
    if (selecionados.size === 0) return
    const ok = await dialog.confirm({
      title: 'Remover da sequência?',
      message: `${selecionados.size} pedido(s) sairão da sequência e voltarão para "aguardando sequência" (atribuições são desfeitas).`,
      variant: 'warning',
      confirmText: 'Remover',
    })
    if (!ok) return
    setAgindo(true)
    setMensagem(null)
    try {
      const res = await sequenciasApi.remover(sequenciaId, Array.from(selecionados))
      setSelecionados(new Set())
      setMensagem({ tipo: 'ok', texto: `${res.removidos.length} pedido(s) removido(s)` })
      await carregar()
    } catch {
      setMensagem({ tipo: 'erro', texto: 'Erro ao remover' })
    } finally {
      setAgindo(false)
    }
  }

  async function excluirSequencia() {
    const ok = await dialog.confirm({
      title: 'Excluir sequência?',
      message: 'Só é possível excluir sequência aberta e vazia.',
      variant: 'danger',
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await sequenciasApi.excluir(sequenciaId)
      router.replace('/supervisor/patio')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setMensagem({ tipo: 'erro', texto: msg ?? 'Erro ao excluir a sequência' })
    }
  }

  if (carregando) {
    return <p className="text-ink-muted p-6">Carregando…</p>
  }
  if (!seq) {
    return <p className="text-red-500 p-6">{mensagem?.texto ?? 'Sequência não encontrada.'}</p>
  }

  const st = STATUS_SEQ[seq.status] ?? STATUS_SEQ.aberta
  const editaveis = seq.pedidos.filter((p) => EDITAVEIS.includes(p.status))
  const conferenteAtual = conferentes.find((c) => c.id === conferenteId)
  const podeExcluir = seq.status === 'aberta' && seq.pedidos.length === 0

  return (
    <div className="p-4 pb-32">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/supervisor/patio')}
            className="text-ink-muted hover:text-ink min-h-[44px] px-2 -ml-2"
          >
            ←
          </button>
          <h1 className="text-2xl font-semibold text-ink">Sequência {seq.numero}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cor}`}>{st.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {podeExcluir && (
            <button onClick={excluirSequencia} className="text-sm text-red-500 min-h-[44px] px-2">
              Excluir
            </button>
          )}
          <button
            onClick={() => router.push(`/supervisor/patio/${sequenciaId}/relatorio`)}
            className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2"
          >
            Relatório
          </button>
          <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
            Atualizar
          </button>
        </div>
      </div>
      <p className="text-sm text-ink-muted mb-4">
        {seq.qtd_pedidos} pedido(s) · {seq.qtd_sem_conferente} sem conferente · {seq.qtd_pendentes} pendente(s) · {seq.qtd_finalizados} finalizado(s)
      </p>

      {seq.status !== 'concluida' && (
        <div className="bg-surface-card border border-surface-border rounded-xl p-3 mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-ink-muted">Atribuir a:</span>
          <select
            value={conferenteId ?? ''}
            onChange={(e) => setConferenteId(Number(e.target.value))}
            className="flex-1 min-w-[160px] bg-surface-elev border border-surface-border text-ink rounded-lg px-2 py-2 text-sm min-h-[44px]"
          >
            {conferentes.length === 0 && <option value="">Nenhum conferente disponível</option>}
            {conferentes.map((c) => {
              const nome = (c.first_name || c.last_name)
                ? `${c.first_name} ${c.last_name}`.trim()
                : c.username
              return <option key={c.id} value={c.id}>{nome} ({c.username})</option>
            })}
          </select>
        </div>
      )}

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

      {seq.pedidos.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">
          Sequência vazia — adicione pedidos pela tela do Pátio.
        </p>
      ) : (
        <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
          <ul>
            {seq.pedidos.map((p) => {
              const cfg = STATUS_PEDIDO[p.status] ?? { label: p.status, cor: 'bg-surface-elev text-ink-muted' }
              const editavel = EDITAVEIS.includes(p.status) && seq.status !== 'concluida'
              const marcado = selecionados.has(p.id)
              return (
                <li
                  key={p.id}
                  onClick={() => editavel && toggle(p.id)}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-surface-border last:border-b-0 transition-colors ${
                    editavel ? 'cursor-pointer' : 'opacity-75'
                  } ${marcado ? 'bg-amber-50 dark:bg-amber-500/10' : editavel ? 'hover:bg-surface-elev/60' : ''}`}
                >
                  {editavel ? (
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => toggle(p.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 accent-amber-500"
                    />
                  ) : (
                    <span className="w-5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{p.numero_externo}</span>
                      <DocBadges tipo={p.tipo} frete={p.frete} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.conferente_username && (
                      <p className="text-xs font-medium text-ink">{p.conferente_username}</p>
                    )}
                    <p className="text-xs text-ink-muted">
                      {p.qtd_itens} {p.qtd_itens === 1 ? 'item' : 'itens'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {editaveis.length > 0 && seq.status !== 'concluida' && selecionados.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-surface-border shadow-lg dark:shadow-2xl dark:shadow-black/40 px-4 py-3 z-20">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-ink-muted">
              {selecionados.size} pedido(s) → <strong className="text-ink">{conferenteAtual?.username ?? '—'}</strong>
            </span>
            <div className="flex gap-2">
              <button
                onClick={remover}
                disabled={agindo}
                className="text-sm text-red-600 dark:text-red-400 px-3 py-2 min-h-[44px] disabled:opacity-50"
              >
                Remover da sequência
              </button>
              <button
                onClick={atribuir}
                disabled={agindo || !conferenteId}
                className="bg-amber-500 hover:bg-amber-400 text-white px-5 py-2 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-50 shadow-lg shadow-amber-500/30 transition-all"
              >
                {agindo ? 'Enviando…' : 'Atribuir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
