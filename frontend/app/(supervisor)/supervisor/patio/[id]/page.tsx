'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  supervisorApi, sequenciasApi,
  type SequenciaResumo, type SequenciaPedido,
} from '@/lib/api'
import { useDialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'

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
  embarcado: { label: 'Embarcado', cor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300' },
}

const STATUS_SEQ: Record<string, { label: string; cor: string }> = {
  aberta: { label: 'Aberta', cor: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  em_andamento: { label: 'Em andamento', cor: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  concluida: { label: 'Concluída', cor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
}

// Pedido ainda "mexível" pelo pátio (atribuir/reatribuir/remover)
const EDITAVEIS = ['selecionado', 'atribuido']

// Filtro local da lista (2026-11-19): a tela já recebe todos os documentos da sequência, e
// com muitas notas ficava difícil achar uma. Busca sem acento por nº, cliente,
// transportadora e conferente; chips de status com contagem.
function semAcento(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
const ORDEM_STATUS = ['selecionado', 'atribuido', 'conferindo', 'aguardando_fechamento', 'conferido', 'embarcado', 'nao_conforme', 'cancelado']

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
  // Nome livre da sequência (2026-11-17): edição inline no cabeçalho
  const [editandoNome, setEditandoNome] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [nome, setNome] = useState('')
  const toast = useToast()

  async function salvarNome() {
    if (!seq) return
    const novo = nome.trim()
    setEditandoNome(false)
    if (novo === (seq.descricao ?? '')) return
    try {
      const r = await sequenciasApi.renomear(sequenciaId, novo)
      setSeq({ ...seq, descricao: r.descricao })
      toast.ok(novo ? `Sequência ${seq.numero} agora se chama "${r.descricao}"` : 'Nome da sequência removido')
    } catch {
      toast.erro('Erro ao salvar o nome da sequência')
    }
  }

  const carregar = useCallback(async () => {
    try {
      const data = await sequenciasApi.detalhe(sequenciaId)
      setSeq(data)
    } catch {
      toast.erro('Erro ao carregar a sequência')
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
    try {
      const res = await sequenciasApi.atribuir(sequenciaId, Array.from(selecionados), conferenteId)
      setSelecionados(new Set())
      toast.ok(`${res.atribuidos.length} pedido(s) atribuído(s) a ${res.conferente}${
          res.ignorados.length ? ` · ${res.ignorados.length} ignorado(s)` : ''
        }`)
      await carregar()
    } catch {
      toast.erro('Erro ao atribuir')
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
    try {
      const res = await sequenciasApi.remover(sequenciaId, Array.from(selecionados))
      setSelecionados(new Set())
      toast.ok(`${res.removidos.length} pedido(s) removido(s)`)
      await carregar()
    } catch {
      toast.erro('Erro ao remover')
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
      toast.erro(msg ?? 'Erro ao excluir a sequência')
    }
  }

  if (carregando) {
    return <p className="text-ink-muted p-6">Carregando…</p>
  }
  if (!seq) {
    return <p className="text-red-500 p-6">Sequência não encontrada.</p>
  }

  const st = STATUS_SEQ[seq.status] ?? STATUS_SEQ.aberta
  const editaveis = seq.pedidos.filter((p) => EDITAVEIS.includes(p.status))
  const conferenteAtual = conferentes.find((c) => c.id === conferenteId)
  const podeExcluir = seq.status === 'aberta' && seq.pedidos.length === 0
  const porStatus = new Map<string, number>()
  for (const p of seq.pedidos) porStatus.set(p.status, (porStatus.get(p.status) ?? 0) + 1)
  const termo = semAcento(busca.trim())
  const visiveis = seq.pedidos.filter((p) => {
    if (filtroStatus && p.status !== filtroStatus) return false
    if (!termo) return true
    const alvo = semAcento(
      `${p.numero_externo} ${p.cliente ?? ''} ${p.transportadora ?? ''} ${p.conferente_username ?? ''} ${p.pedidos_origem ?? ''}`,
    )
    return alvo.includes(termo)
  })
  const filtrando = !!filtroStatus || !!termo

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
          {editandoNome ? (
            <input
              autoFocus
              type="text"
              value={nome}
              maxLength={120}
              onChange={(e) => setNome(e.target.value)}
              onBlur={salvarNome}
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarNome()
                if (e.key === 'Escape') setEditandoNome(false)
              }}
              placeholder="Nome (ex.: aba da planilha)"
              className="bg-surface-elev border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-2 py-1 text-base min-h-[40px] w-56"
            />
          ) : (
            <button
              onClick={() => { setNome(seq.descricao ?? ''); setEditandoNome(true) }}
              title="Renomear a sequência"
              className={`text-base min-h-[40px] px-2 rounded-lg hover:bg-surface-elev transition-colors ${
                seq.descricao ? 'text-ink' : 'text-ink-subtle italic'
              }`}
            >
              {seq.descricao ? `· ${seq.descricao}` : '+ nome'}
            </button>
          )}
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

      {seq.pedidos.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="relative">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nº, cliente, transportadora, conferente…"
              className="w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px]"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[36px] px-2 text-ink-subtle hover:text-ink"
                aria-label="Limpar busca"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            <button
              onClick={() => setFiltroStatus('')}
              className={`shrink-0 text-xs px-3 min-h-[36px] rounded-full border font-medium transition-colors ${
                !filtroStatus ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100' : 'border-surface-border text-ink-muted hover:bg-surface-elev'
              }`}
            >
              Todos · {seq.pedidos.length}
            </button>
            {ORDEM_STATUS.filter((s) => porStatus.has(s)).map((s) => {
              const cfg = STATUS_PEDIDO[s]
              const ativo = filtroStatus === s
              return (
                <button
                  key={s}
                  onClick={() => setFiltroStatus(ativo ? '' : s)}
                  className={`shrink-0 text-xs px-3 min-h-[36px] rounded-full border font-medium transition-colors ${
                    ativo ? `${cfg.cor} border-current` : 'border-surface-border text-ink-muted hover:bg-surface-elev'
                  }`}
                >
                  {cfg.label} · {porStatus.get(s)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {seq.pedidos.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">
          Sequência vazia — adicione pedidos pela tela do Pátio.
        </p>
      ) : visiveis.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">
          Nenhum documento com esse filtro.{' '}
          <button onClick={() => { setBusca(''); setFiltroStatus('') }} className="underline underline-offset-2 text-ink-muted hover:text-ink">Limpar</button>
        </p>
      ) : (
        <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
          {filtrando && (
            <p className="px-4 py-2 text-xs text-ink-subtle border-b border-surface-border">
              {visiveis.length} de {seq.pedidos.length}
            </p>
          )}
          <ul>
            {visiveis.map((p) => {
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
                      <DocBadges tipo={p.tipo} frete={p.frete} origem={p.pedidos_origem} />
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cor}`}>{cfg.label}</span>
                      {p.embarque_numero && p.status !== 'embarcado' && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          title={`A nota já está no embarque ${p.embarque_numero} do Senior`}
                        >
                          ⚠ Nota já embarcada
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}</p>
                    {p.transportadora && (
                      <p className="text-xs text-ink-subtle truncate">{p.transportadora}</p>
                    )}
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
