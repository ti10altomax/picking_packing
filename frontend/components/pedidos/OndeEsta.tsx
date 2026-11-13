'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supervisorApi, type Localizacao } from '@/lib/api'

/**
 * "Não está nesta lista, mas está ali" (2026-11-05). Cada lista só busca no seu status, e
 * procurar em Vendas um pedido que já está em conferência voltava vazio, sem explicação.
 * Mostrar no lugar do "nenhum resultado" quando a busca é um número.
 */

// Paleta de status do CLAUDE.md (também usada pelo modal "Colar lista" de Vendas)
export const COR_STATUS: Record<string, string> = {
  pendente: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
  selecionado: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  atribuido: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300',
  conferindo: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  aguardando_fechamento: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  conferido: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  nao_conforme: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  cancelado: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

const ROTA: Record<string, (l: Localizacao) => string> = {
  vendas: () => '/supervisor/vendas',
  patio: () => '/supervisor/patio',
  sequencia: (l) => (l.sequencia ? `/supervisor/patio/${l.sequencia}` : '/supervisor/patio'),
  fechamentos: () => '/supervisor/fechamentos',
  conferidos: () => '/supervisor/conferidos',
  nao_conformes: () => '/supervisor/nao-conformes',
  cancelados: () => '/supervisor/cancelados',
}

/** Rota da lista em que o documento está (ou undefined). */
export function rotaDaLocalizacao(l: Localizacao): string | undefined {
  return ROTA[l.lista]?.(l)
}

export function OndeEsta({ busca, lista }: { busca: string; lista: Localizacao['lista'] }) {
  const [achados, setAchados] = useState<Localizacao[] | null>(null)
  const numero = busca.trim()

  useEffect(() => {
    setAchados(null)
    if (!/^\d+$/.test(numero)) return
    let vivo = true
    supervisorApi.localizar(numero).then((r) => { if (vivo) setAchados(r) }).catch(() => {})
    return () => { vivo = false }
  }, [numero])

  // o que está nesta própria lista já teria aparecido na busca
  const fora = (achados ?? []).filter((l) => l.lista !== lista)
  if (!fora.length) return null

  return (
    <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-500/40 dark:bg-blue-500/10">
      <p className="text-base font-bold text-ink">
        {numero} não está nesta lista — está em outra etapa:
      </p>
      <ul className="mt-3 space-y-2">
        {fora.map((l) => {
          const rota = rotaDaLocalizacao(l)
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-surface-card px-3 py-2.5 border border-surface-border">
              <span className="font-mono font-bold text-ink">
                {l.tipo === 'nota_fiscal' ? 'NF ' : 'Pedido '}{l.numero_externo}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_STATUS[l.status] ?? COR_STATUS.pendente}`}>
                {l.status_label}
              </span>
              <span className="text-sm text-ink-muted min-w-0 flex-1 basis-48">
                {l.descricao}
                {l.via && <span className="block text-xs text-ink-subtle">{l.via}</span>}
              </span>
              {rota && (
                <Link
                  href={rota}
                  className="ml-auto inline-flex min-h-[40px] items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500"
                >
                  Ver
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
