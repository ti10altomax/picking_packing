'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { sequenciasApi, type RelatorioSequencia } from '@/lib/api'

const TIPO_LABEL: Record<string, string> = { caixa: 'Caixa', fardo: 'Fardo', outro: 'Outro' }

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

  const { sequencia, linhas, totais, volumes } = dados

  return (
    <div className="max-w-4xl mx-auto p-4 print:p-0">
      <div className="flex items-center justify-between mb-1 print:hidden">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/supervisor/patio/${sequenciaId}`)}
            className="text-ink-muted hover:text-ink min-h-[44px] px-2 -ml-2"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-ink">Relatório — Sequência {sequencia.numero}</h1>
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
