'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { sequenciasApi, type RelatorioSequencia } from '@/lib/api'
import { DocBadges } from '@/components/ui/DocBadges'

const TIPO_LABEL: Record<string, string> = { caixa: 'Caixa', fardo: 'Fardo', outro: 'Outro' }

// Mesma paleta de status das listas; na impressão fica só o texto
const COR_STATUS: Record<string, string> = {
  selecionado: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  atribuido: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  conferindo: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
  aguardando_fechamento: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  conferido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  nao_conforme: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  cancelado: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

// "2 cx · 1 fd" — compacto o bastante para caber na coluna impressa
function resumoVolumes(v: { caixa: number; fardo: number; outro: number; total: number }) {
  if (!v.total) return '—'
  return [v.caixa && `${v.caixa} cx`, v.fardo && `${v.fardo} fd`, v.outro && `${v.outro} out`]
    .filter(Boolean).join(' · ')
}

export default function RelatorioSequenciaPage() {
  const router = useRouter()
  const params = useParams()
  const sequenciaId = Number(params.id)
  const [dados, setDados] = useState<RelatorioSequencia | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    sequenciasApi.relatorio(sequenciaId)
      .then(setDados)
      .catch(() => setErro('Erro ao carregar o relatório'))
  }, [sequenciaId])

  if (erro) return <p className="text-red-500 p-6">{erro}</p>
  if (!dados) return <p className="text-ink-muted p-6">Carregando…</p>

  const { sequencia, documentos, linhas, totais, volumes } = dados
  const totalUnidPedidas = documentos.reduce((s, d) => s + d.unid_pedidas, 0)
  const totalUnidConferidas = documentos.reduce((s, d) => s + d.unid_conferidas, 0)

  return (
    <div className="p-4 print:p-0">
      <div className="flex items-center justify-between mb-1 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/supervisor/patio/${sequenciaId}`)}
            className="text-ink-muted hover:text-ink min-h-[44px] px-2 -ml-2"
          >
            ←
          </button>
          <h1 className="text-2xl font-semibold text-ink">Relatório — Sequência {sequencia.numero}</h1>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 h-11 rounded-lg text-sm font-semibold"
        >
          Imprimir
        </button>
      </div>

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Separa — Relatório de separação · Sequência {sequencia.numero}</h1>
      </div>

      <p className="text-sm text-ink-muted mb-4">
        Criada em {new Date(sequencia.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {sequencia.concluida_em && ` · concluída em ${new Date(sequencia.concluida_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
        {' · '}
        {Object.entries(volumes).map(([tipo, n]) => `${n} ${TIPO_LABEL[tipo]?.toLowerCase() ?? tipo}(s)`).join(' · ') || 'sem volumes'}
      </p>

      {/* Documentos da sequência — ponto 2 da diretoria (2026-10-01) */}
      <h2 className="text-base font-semibold text-ink mb-2 print:text-black">
        Documentos ({documentos.length})
      </h2>
      {documentos.length === 0 ? (
        <p className="text-ink-subtle text-sm mb-6">Nenhum documento nesta sequência.</p>
      ) : (
        <div className="overflow-x-auto bg-surface-card border border-surface-border rounded-xl print:border-black mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-elev/50 text-left text-xs text-ink-muted print:text-black">
                <th className="px-3 py-2 font-semibold">Documento</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Conferente</th>
                <th className="px-3 py-2 font-semibold">Separado por</th>
                <th className="px-3 py-2 font-semibold text-right">Volumes</th>
                <th className="px-3 py-2 font-semibold text-right">Unid.</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className={`border-b border-surface-border last:border-b-0 ${d.status === 'cancelado' ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-bold text-ink">{d.numero_externo}</span>
                    <span className="ml-1.5 inline-flex gap-1 align-middle print:hidden"><DocBadges tipo={d.tipo} frete={d.frete} /></span>
                    <span className="hidden print:inline text-xs ml-1">
                      {d.tipo === 'nota_fiscal' ? 'NF' : 'Ped.'}{d.frete_label && ` · ${d.frete_label}`}
                    </span>
                    {d.transferido_para && (
                      <p className="text-xs text-ink-subtle">→ transferido p/ {d.transferido_para}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink max-w-[260px] truncate">{d.cliente || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium print:p-0 print:bg-transparent print:text-black ${COR_STATUS[d.status] ?? 'bg-surface-elev text-ink-muted'}`}>
                      {d.status_label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink">{d.conferente ?? '—'}</td>
                  <td className="px-3 py-2 text-ink">
                    {d.separado_por ?? (d.separador_nao_identificado ? <span className="text-amber-600 dark:text-amber-400">não identificado</span> : '—')}
                  </td>
                  <td className="px-3 py-2 text-right text-ink whitespace-nowrap">{resumoVolumes(d.volumes)}</td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums whitespace-nowrap">
                    {d.unid_conferidas}<span className="text-ink-subtle">/{d.unid_pedidas}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-elev/50 font-bold text-ink">
                <td className="px-3 py-2" colSpan={5}>{documentos.length} documento(s)</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{resumoVolumes({
                  caixa: volumes.caixa ?? 0, fardo: volumes.fardo ?? 0, outro: volumes.outro ?? 0,
                  total: Object.values(volumes).reduce((a, b) => a + b, 0),
                })}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  {totalUnidConferidas}<span className="text-ink-subtle font-normal">/{totalUnidPedidas}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h2 className="text-base font-semibold text-ink mb-2 print:text-black">Produtos por tipo de volume</h2>
      {linhas.length === 0 ? (
        <p className="text-ink-subtle text-center py-12">Nenhuma bipagem registrada nesta sequência.</p>
      ) : (
        <div className="overflow-x-auto bg-surface-card border border-surface-border rounded-xl print:border-black">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-elev/50 text-left text-xs text-ink-muted print:text-black">
                <th className="px-3 py-2 font-semibold">Produto</th>
                <th className="px-3 py-2 font-semibold text-right">Caixa</th>
                <th className="px-3 py-2 font-semibold text-right">Fardo</th>
                <th className="px-3 py-2 font-semibold text-right">Outro</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.sku} className="border-b border-surface-border last:border-b-0">
                  <td className="px-3 py-2">
                    <p className="font-medium text-ink leading-snug">{l.descricao || l.sku}</p>
                    <p className="text-xs text-ink-subtle">{l.sku}</p>
                  </td>
                  <td className="px-3 py-2 text-right text-ink">{l.caixa || '—'}</td>
                  <td className="px-3 py-2 text-right text-ink">{l.fardo || '—'}</td>
                  <td className="px-3 py-2 text-right text-ink">{l.outro || '—'}</td>
                  <td className="px-3 py-2 text-right font-bold text-ink">{l.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-elev/50 font-bold text-ink">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{totais.caixa || '—'}</td>
                <td className="px-3 py-2 text-right">{totais.fardo || '—'}</td>
                <td className="px-3 py-2 text-right">{totais.outro || '—'}</td>
                <td className="px-3 py-2 text-right">{totais.total}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
