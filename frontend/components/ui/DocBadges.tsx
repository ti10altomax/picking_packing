/**
 * Badges do documento de origem no Senior.
 *  - tipo: 'pedido' (sem badge) | 'nota_fiscal' (chip "NF")
 *  - frete (CIFFOB): C = Entrega · F = Retira (cliente busca) · X = Sem frete
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

export function DocBadges({ tipo, frete }: { tipo?: string; frete?: string }) {
  const fl = freteLabel(frete)
  if (tipo !== 'nota_fiscal' && !fl) return null
  return (
    <>
      {tipo === 'nota_fiscal' && (
        <span className={`${CHIP} font-bold tracking-wide bg-surface-elev text-ink border border-surface-border`}>
          NF
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
