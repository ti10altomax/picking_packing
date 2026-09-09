import { View, Text } from 'react-native'

/**
 * Badges do documento de origem no Senior (paridade com o web).
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

export function DocBadges({ tipo, frete }: { tipo?: string; frete?: string }) {
  const fl = freteLabel(frete)
  if (tipo !== 'nota_fiscal' && !fl) return null
  return (
    <>
      {tipo === 'nota_fiscal' ? (
        <View className="px-1.5 py-0.5 rounded bg-surface-elev border border-surface-border">
          <Text className="text-xs font-bold text-ink">NF</Text>
        </View>
      ) : null}
      {fl ? (
        <View
          className={`px-1.5 py-0.5 rounded ${
            frete === 'F' ? 'bg-teal-500/15' : 'border border-surface-border'
          }`}
        >
          <Text className={`text-xs ${frete === 'F' ? 'font-semibold text-teal-300' : 'text-ink-subtle'}`}>
            {fl}
          </Text>
        </View>
      ) : null}
    </>
  )
}
