/**
 * Badges do documento de origem no Senior.
 *  - tipo: 'pedido' (sem badge) | 'nota_fiscal' (chip "NF")
 *  - frete (CIFFOB): C = Entrega · F = Retira (cliente busca) · X = Sem frete
 *  - origem: NF que saiu de pedido → "ped. 169992" (faturamento parcial, 2026-11-05)
 *  - nfs: pedido com nota(s) que viraram documento → "NF 150250" em âmbar — a mesma venda
 *    também está na lista como nota; conferir as duas é barrado no servidor
 */
const FRETE_LABEL: Record<string, string> = { C: 'Entrega', F: 'Retira', X: 'Sem frete' }

export function nomeDoc(tipo?: string): string {
  return tipo === 'nota_fiscal' ? 'NF' : 'pedido'
}

export function freteLabel(frete?: string): string {
  if (!frete) return ''
  return FRETE_LABEL[frete] ?? `Frete ${frete}`
}

const CHIP = 'inline-flex items-center text-[11px] leading-4 px-1.5 py-0.5 rounded'

export function DocBadges({ tipo, frete, origem, nfs }: {
  tipo?: string; frete?: string; origem?: string[]; nfs?: string[]
}) {
  const fl = freteLabel(frete)
  const temOrigem = tipo === 'nota_fiscal' && !!origem?.length
  const temNfs = tipo !== 'nota_fiscal' && !!nfs?.length
  if (tipo !== 'nota_fiscal' && !fl && !temNfs) return null
  return (
    <>
      {tipo === 'nota_fiscal' && (
        <span className={`${CHIP} font-bold tracking-wide bg-surface-elev text-ink border border-surface-border`}>
          NF
        </span>
      )}
      {temOrigem && (
        <span className={`${CHIP} text-ink-subtle border border-surface-border`}>
          ped. {origem!.join(', ')}
        </span>
      )}
      {temNfs && (
        <span
          className={`${CHIP} font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`}
          title="Esta venda já foi faturada e a nota está na lista — confira pela nota"
        >
          NF {nfs!.join(', ')}
        </span>
      )}
      {fl && (
        <span
          className={`${CHIP} ${
            frete === 'F'
              ? 'font-semibold bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300'
              : 'text-ink-subtle border border-surface-border'
          }`}
        >
          {fl}
        </span>
      )}
    </>
  )
}
