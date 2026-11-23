'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supervisorApi, type DocSemTransportadora, type RelatorioSemTransportadora } from '@/lib/api'
import { DocBadges } from '@/components/ui/DocBadges'

/**
 * Relatório: Conferidos sem transportadora (2026-11-23).
 * As notas já conferidas que ainda precisam da transportadora — sem ela a etiqueta de volume
 * não sai. A lista é para imprimir e entregar a quem define a transportadora; a correção em si
 * é feita em Conferidos (filtro "Sem transportadora" → Corrigir NF) ou direto no Senior.
 * O backend relê o Senior antes de responder, então nota já acertada lá não aparece.
 */

type Ordem = 'antigas' | 'cliente'

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtCompleto(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ordenar(docs: DocSemTransportadora[], ordem: Ordem) {
  const copia = [...docs]
  if (ordem === 'cliente') {
    copia.sort((a, b) =>
      (a.cliente || '').localeCompare(b.cliente || '', 'pt-BR') || a.numero_externo.localeCompare(b.numero_externo, 'pt-BR', { numeric: true }))
  }
  return copia   // 'antigas' = ordem do servidor (conferido há mais tempo primeiro)
}

export default function ConferidosSemTransportadoraPage() {
  const router = useRouter()
  const [dados, setDados] = useState<RelatorioSemTransportadora | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [ordem, setOrdem] = useState<Ordem>('antigas')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setDados(await supervisorApi.relatorioSemTransportadora())
    } catch {
      setErro('Erro ao carregar o relatório')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Entrega precisa de transportadora; retira e sem frete ficam à parte (não precisam)
  const { entrega, outros } = useMemo(() => {
    const docs = dados?.documentos ?? []
    return {
      entrega: ordenar(docs.filter((d) => d.frete === 'C'), ordem),
      outros: ordenar(docs.filter((d) => d.frete !== 'C'), ordem),
    }
  }, [dados, ordem])

  if (erro && !dados) return <p className="text-red-500 p-6">{erro}</p>
  if (!dados) return <p className="text-ink-muted p-6">Carregando…</p>

  return (
    <div className="p-4 print:p-0">
      {/* flex-wrap: a 360px o título ocupa a linha e os botões descem para a de baixo */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 mb-1 print:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.push('/supervisor/conferidos')}
            className="text-ink-muted hover:text-ink min-h-[44px] px-2 -ml-2"
            aria-label="Voltar para Conferidos"
          >
            ←
          </button>
          <h1 className="text-2xl font-semibold text-ink">Conferidos sem transportadora</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            onClick={carregar}
            disabled={carregando}
            className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2 disabled:opacity-50"
          >
            {carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button
            onClick={() => window.print()}
            className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 h-11 rounded-lg text-sm font-semibold"
          >
            Imprimir
          </button>
        </div>
      </div>

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block mb-3">
        <h1 className="text-xl font-bold">Separa — Conferidos sem transportadora</h1>
      </div>

      <p className="text-sm text-ink-muted print:text-black mb-3">
        <strong className="text-ink print:text-black">{entrega.length}</strong>{' '}
        {entrega.length === 1 ? 'documento de entrega aguarda' : 'documentos de entrega aguardam'} transportadora
        {outros.length > 0 && <> · {outros.length} de retira ou sem frete</>}
        {' · '}gerado em {fmtCompleto(dados.gerado_em)}
      </p>

      {!dados.senior_consultado && (
        <p className="mb-3 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 print:border-black print:bg-transparent print:text-black">
          Não consegui consultar o Senior agora. A lista usa a última leitura automática; pode haver nota que já ganhou transportadora.
        </p>
      )}
      {dados.preenchidas_agora > 0 && (
        <p className="mb-3 text-sm text-ink-muted print:hidden">
          {dados.preenchidas_agora === 1
            ? '1 nota já estava com transportadora no Senior e saiu da lista.'
            : `${dados.preenchidas_agora} notas já estavam com transportadora no Senior e saíram da lista.`}
        </p>
      )}

      <div className="mb-4 flex items-center gap-2 print:hidden">
        <span className="text-xs text-ink-subtle">Ordenar por</span>
        <div className="inline-flex rounded-lg border border-surface-border overflow-hidden">
          {([['antigas', 'Mais antigas'], ['cliente', 'Cliente']] as [Ordem, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setOrdem(v)}
              className={`px-3 min-h-[40px] text-sm whitespace-nowrap transition-colors ${
                ordem === v ? 'bg-emerald-600 text-white font-semibold' : 'bg-surface-card text-ink-muted hover:bg-surface-elev'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-base font-semibold text-ink mb-2 print:text-black">Entrega — precisam de transportadora ({entrega.length})</h2>
      {entrega.length === 0 ? (
        <p className="text-ink-subtle text-sm mb-6">Nenhum documento de entrega conferido está sem transportadora.</p>
      ) : (
        <Tabela docs={entrega} />
      )}

      {outros.length > 0 && (
        <>
          <h2 className="text-base font-semibold text-ink mb-1 print:text-black">Retira ou sem frete ({outros.length})</h2>
          <p className="text-xs text-ink-subtle print:text-black mb-2">
            Não saem por transportadora. Estão aqui para conferência: se alguma deveria ser de entrega, o frete também precisa ser corrigido.
          </p>
          <Tabela docs={outros} mostrarFrete />
        </>
      )}
    </div>
  )
}

function Tabela({ docs, mostrarFrete = false }: { docs: DocSemTransportadora[]; mostrarFrete?: boolean }) {
  return (
    <div className="overflow-x-auto bg-surface-card border border-surface-border rounded-xl print:border-black print:rounded-none mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-elev/50 text-left text-xs text-ink-muted print:text-black">
            <th className="px-3 py-2 font-semibold">Documento</th>
            <th className="px-3 py-2 font-semibold">Cliente</th>
            {mostrarFrete && <th className="px-3 py-2 font-semibold">Frete</th>}
            <th className="px-3 py-2 font-semibold">Conferido em</th>
            <th className="px-3 py-2 font-semibold">Conferente</th>
            <th className="px-3 py-2 font-semibold text-right">Volumes</th>
            {/* Só no papel e só na entrega: espaço para quem define a transportadora anotar */}
            {!mostrarFrete && <th className="px-3 py-2 font-semibold hidden print:table-cell w-[26%]">Transportadora</th>}
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const divergente = d.nf_volumes !== null && d.nf_volumes !== d.volumes
            return (
              <tr key={d.id} className="border-b border-surface-border last:border-b-0 print:border-black/40 break-inside-avoid">
                <td className="px-3 py-2 whitespace-nowrap align-top">
                  <span className="font-bold text-ink print:text-black">{d.numero_externo}</span>
                  <span className="ml-1.5 inline-flex gap-1 align-middle print:hidden"><DocBadges tipo={d.tipo} /></span>
                  <span className="hidden print:inline text-xs ml-1">{d.tipo === 'nota_fiscal' ? 'NF' : 'Ped.'}</span>
                  {d.tipo === 'nota_fiscal' && d.pedidos_origem.length > 0 && (
                    <p className="text-xs text-ink-subtle print:text-black">ped. {d.pedidos_origem.join(', ')}</p>
                  )}
                  {d.tipo !== 'nota_fiscal' && d.nf_numero && (
                    <p className="text-xs text-ink-subtle print:text-black">NF {d.nf_numero}</p>
                  )}
                </td>
                <td className="px-3 py-2 text-ink print:text-black align-top min-w-[200px] print:min-w-0">{d.cliente || '—'}</td>
                {mostrarFrete && (
                  <td className="px-3 py-2 text-ink print:text-black whitespace-nowrap align-top">{d.frete_label || 'não informado'}</td>
                )}
                <td className="px-3 py-2 text-ink print:text-black whitespace-nowrap tabular-nums align-top">{fmt(d.conferido_em)}</td>
                <td className="px-3 py-2 text-ink print:text-black align-top">{d.conferente ?? '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums align-top">
                  <span className="text-ink print:text-black">{d.volumes}</span>
                  {divergente && (
                    <span
                      className="ml-1 text-xs font-semibold text-amber-600 dark:text-amber-400 print:text-black"
                      title="A nota está com outra quantidade de volumes: a mesma carta de correção pode acertar os dois"
                    >
                      (NF {d.nf_volumes})
                    </span>
                  )}
                </td>
                {!mostrarFrete && (
                  <td className="px-3 py-2 hidden print:table-cell align-bottom">
                    <span className="block border-b border-black h-5" />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-surface-elev/50 font-bold text-ink print:text-black">
            <td className="px-3 py-2" colSpan={mostrarFrete ? 5 : 4}>{docs.length} documento(s)</td>
            <td className="px-3 py-2 text-right tabular-nums">{docs.reduce((s, d) => s + d.volumes, 0)}</td>
            {!mostrarFrete && <td className="hidden print:table-cell" />}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
