'use client'
import { DocBadges } from '@/components/ui/DocBadges'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supervisorApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useDialog } from '@/components/Dialog'

// Documento cancelado no Senior (sitPed=5 / sitNfv=9) ou pelo supervisor, que tinha
// conferência em andamento ou concluída. As caixas continuam montadas: o Sup. Pátio
// aponta o documento reemitido e a conferência é transferida sem desmontar nada.

type Cancelado = {
  id: number
  tipo: string
  numero_externo: string
  codfil: string
  codsnf: string
  frete?: string
  cliente: string
  criado_em: string
  cancelado_em: string
  cancelado_origem: 'senior' | 'supervisor' | ''
  cancelado_origem_label: string
  status_anterior: string
  status_anterior_label: string
  sequencia: { id: number; numero: number } | null
  conferente: string | null
  separado_por: string | null
  qtd_itens: number
  qtd_volumes: number
  tem_conferencia: boolean
  transferido_para: { id: number; tipo: string; numero_externo: string; status: string } | null
}

type LinhaComparacao = {
  sku: string
  descricao: string
  qtd_origem: number
  qtd_destino: number
  qtd_separada_origem: number
  situacao: 'igual' | 'qtd_diferente' | 'so_na_origem' | 'so_no_destino'
}

type Comparacao = { igual: boolean; itens: LinhaComparacao[] }

type Destino = {
  id: number
  tipo: string
  numero_externo: string
  codfil: string
  codsnf: string
  cliente: string
  status: string
  criado_em: string
  comparacao: Comparacao
}

const COR_STATUS: Record<string, string> = {
  atribuido: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  conferindo: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  aguardando_fechamento: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  conferido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  nao_conforme: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

const SITUACAO_LABEL: Record<LinhaComparacao['situacao'], string> = {
  igual: 'ok',
  qtd_diferente: 'qtd diferente',
  so_na_origem: 'falta no novo',
  so_no_destino: 'só no novo',
}

function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function nomeDoc(tipo: string) {
  return tipo === 'nota_fiscal' ? 'NF' : 'Pedido'
}

export default function CanceladosPage() {
  const dialog = useDialog()
  const { user } = useAuthStore()
  const podeTransferir = user?.perfil === 'supervisor_patio' || user?.perfil === 'admin'

  const [lista, setLista] = useState<Cancelado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [transferindo, setTransferindo] = useState<Cancelado | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      setLista(await supervisorApi.listarCancelados())
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const pendentes = lista.filter((c) => !c.transferido_para)
  const transferidos = lista.filter((c) => c.transferido_para)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cancelados</h1>
          <p className="text-sm text-ink-muted">
            Documentos cancelados com conferência já feita — transfira para a nota reemitida
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
        <p className="text-ink-subtle text-center py-12">Nenhum documento cancelado com conferência.</p>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="space-y-3">
              {pendentes.map((c) => (
                <CardCancelado
                  key={c.id}
                  c={c}
                  podeTransferir={podeTransferir}
                  onTransferir={() => setTransferindo(c)}
                />
              ))}
            </div>
          )}

          {transferidos.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle mb-3">
                Já transferidos
              </h2>
              <div className="space-y-3 opacity-80">
                {transferidos.map((c) => (
                  <CardCancelado key={c.id} c={c} podeTransferir={false} onTransferir={() => {}} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {transferindo && (
        <ModalTransferir
          origem={transferindo}
          onFechar={() => setTransferindo(null)}
          onTransferido={async (destino) => {
            setTransferindo(null)
            setMensagem({
              tipo: 'ok',
              texto: `Conferência de ${transferindo.numero_externo} transferida para ${nomeDoc(destino.tipo)} ${destino.numero_externo}`,
            })
            await carregar()
          }}
          dialog={dialog}
        />
      )}
    </div>
  )
}

function CardCancelado({
  c, podeTransferir, onTransferir,
}: {
  c: Cancelado
  podeTransferir: boolean
  onTransferir: () => void
}) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-ink">{c.numero_externo}</span>
          <DocBadges tipo={c.tipo} frete={c.frete} />
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COR_STATUS[c.status_anterior] ?? 'bg-surface-elev text-ink-muted'}`}>
            era: {c.status_anterior_label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
            {c.cancelado_origem === 'senior' ? 'Senior' : 'supervisor'}
          </span>
        </div>
        <p className="text-sm text-ink-muted truncate">{c.cliente || '—'}</p>
        <p className="text-xs text-ink-subtle mt-1">
          Cancelado em {fmtData(c.cancelado_em)}
          {c.sequencia && ` · sequência ${c.sequencia.numero}`}
          {c.conferente && ` · conferente: ${c.conferente}`}
          {c.separado_por && ` · separado por: ${c.separado_por}`}
        </p>
        <p className="text-xs text-ink-subtle mt-1">
          {c.qtd_itens} {c.qtd_itens === 1 ? 'item' : 'itens'} · {c.qtd_volumes} {c.qtd_volumes === 1 ? 'volume' : 'volumes'}
        </p>
        {c.transferido_para && (
          <p className="text-sm mt-2 p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded-lg">
            Transferido para {nomeDoc(c.transferido_para.tipo)} <strong>{c.transferido_para.numero_externo}</strong>
          </p>
        )}
      </div>

      {!c.transferido_para && (
        <div className="flex gap-2 px-4 py-3 border-t border-surface-border">
          {podeTransferir ? (
            <button
              onClick={onTransferir}
              className="flex-1 h-10 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 rounded-lg text-sm font-medium transition-colors"
            >
              Transferir conferência…
            </button>
          ) : (
            <p className="text-xs text-ink-subtle py-2">Transferência é feita pelo Supervisor de Pátio.</p>
          )}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Modal: digita o número do documento reemitido → busca → compara itens → confirma
// -----------------------------------------------------------------------------

function ModalTransferir({
  origem, onFechar, onTransferido, dialog,
}: {
  origem: Cancelado
  onFechar: () => void
  onTransferido: (destino: { id: number; tipo: string; numero_externo: string }) => void
  dialog: ReturnType<typeof useDialog>
}) {
  const [busca, setBusca] = useState('')
  const [destinos, setDestinos] = useState<Destino[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escolhido, setEscolhido] = useState<Destino | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Busca com debounce curto; o backend já devolve a comparação de cada candidato
  useEffect(() => {
    const q = busca.trim()
    if (q.length < 2) { setDestinos([]); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        setDestinos(await supervisorApi.buscarDestinosTransferencia(origem.id, q))
      } catch {
        setDestinos([])
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [busca, origem.id])

  async function confirmar() {
    if (!escolhido) return
    const ok = await dialog.confirm({
      title: 'Transferir conferência?',
      message: `Os ${origem.qtd_volumes} volume(s) e o progresso de ${origem.numero_externo} passam para ${nomeDoc(escolhido.tipo)} ${escolhido.numero_externo}, que assume o status "${origem.status_anterior_label}"${origem.sequencia ? ` na sequência ${origem.sequencia.numero}` : ''}.`,
      variant: 'info',
      confirmText: 'Transferir',
    })
    if (!ok) return
    setEnviando(true)
    setErro('')
    try {
      await supervisorApi.transferirConferencia(origem.id, escolhido.id)
      onTransferido(escolhido)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { erro?: string } } }
      setErro(e?.response?.data?.erro ?? 'Erro ao transferir')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] bg-surface-card rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-start justify-between p-4 border-b border-surface-border">
          <div>
            <h2 className="text-lg font-bold text-ink">Transferir conferência</h2>
            <p className="text-sm text-ink-muted">
              de <strong>{origem.numero_externo}</strong> ({origem.qtd_volumes} vol.) para o documento reemitido
            </p>
          </div>
          <button onClick={onFechar} className="text-ink-subtle hover:text-ink text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setEscolhido(null) }}
            placeholder="Número do pedido ou da NF nova…"
            inputMode="numeric"
            className="w-full h-12 px-4 rounded-xl bg-surface-elev text-ink border border-surface-border focus:border-blue-500 outline-none text-base"
          />

          {buscando && <p className="text-xs text-ink-subtle">Buscando…</p>}
          {!buscando && busca.trim().length >= 2 && destinos.length === 0 && (
            <p className="text-sm text-ink-subtle">
              Nenhum documento Pendente ou Selecionado com esse número. O sync do Senior roda a cada 2 min —
              se a nota acabou de ser emitida, aguarde e tente de novo.
            </p>
          )}

          {/* Com um candidato escolhido, os outros somem e a comparação fica logo abaixo */}
          {destinos.filter((d) => !escolhido || d.id === escolhido.id).map((d) => {
            const sel = escolhido?.id === d.id
            return (
              <button
                key={d.id}
                onClick={() => setEscolhido(sel ? null : d)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  sel
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                    : 'border-surface-border bg-surface-elev/40 hover:bg-surface-elev'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink">{nomeDoc(d.tipo)} {d.numero_externo}</span>
                  <span className="text-xs text-ink-subtle">{d.status === 'pendente' ? 'Pendente' : 'Selecionado'}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${
                    d.comparacao.igual
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
                  }`}>
                    {d.comparacao.igual ? 'itens batem' : 'itens diferentes'}
                  </span>
                </div>
                <p className="text-sm text-ink-muted truncate">{d.cliente || '—'}</p>
                {sel && <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">toque de novo para escolher outro</p>}
              </button>
            )
          })}

          {escolhido && (
            <div className="rounded-xl border border-surface-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-elev text-xs text-ink-subtle uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-right px-3 py-2">Cancelado</th>
                    <th className="text-right px-3 py-2">Novo</th>
                    <th className="text-right px-3 py-2">Conferido</th>
                  </tr>
                </thead>
                <tbody>
                  {escolhido.comparacao.itens.map((l) => (
                    <tr key={l.sku} className={`border-t border-surface-border ${l.situacao !== 'igual' ? 'bg-red-50 dark:bg-red-500/10' : ''}`}>
                      <td className="px-3 py-2">
                        <p className="text-ink leading-snug">{l.descricao || l.sku}</p>
                        <p className="text-xs text-ink-subtle">
                          {l.sku}
                          {l.situacao !== 'igual' && (
                            <span className="ml-2 text-red-600 dark:text-red-400 font-medium">{SITUACAO_LABEL[l.situacao]}</span>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.qtd_origem}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.qtd_destino}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{l.qtd_separada_origem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!escolhido.comparacao.igual && (
                <p className="px-3 py-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border-t border-surface-border">
                  Os itens não batem — a transferência é bloqueada. A nota nova precisa ser conferida do zero.
                </p>
              )}
            </div>
          )}

          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>

        <div className="p-4 border-t border-surface-border flex gap-2">
          <button onClick={onFechar} className="flex-1 h-12 rounded-xl bg-surface-elev text-ink font-medium">
            Voltar
          </button>
          <button
            onClick={confirmar}
            disabled={!escolhido || !escolhido.comparacao.igual || enviando}
            className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {enviando ? 'Transferindo…' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}
