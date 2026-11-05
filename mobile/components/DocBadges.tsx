import { View, Text } from 'react-native'

/**
 * Badges do documento de origem no Senior (paridade com o web).
 *  - tipo: 'pedido' (sem badge) | 'nota_fiscal' (chip "NF")
 *  - frete (CIFFOB): C = Entrega · F = Retira (cliente busca) · X = Sem frete
 *  - origem: NF que saiu de pedido → "ped. 169992" (faturamento parcial, 2026-11-05)
 *  - nfs: pedido com nota(s) que viraram documento → "NF 150250" em âmbar
 */
const FRETE_LABEL: Record<string, string> = { C: 'Entrega', F: 'Retira', X: 'Sem frete' }

export function nomeDoc(tipo?: string): string {
  return tipo === 'nota_fiscal' ? 'NF' : 'pedido'
}

export function freteLabel(frete?: string): string {
  if (!frete) return ''
  return FRETE_LABEL[frete] ?? `Frete ${frete}`
}

export function DocBadges({ tipo, frete, origem, nfs }: {
  tipo?: string; frete?: string; origem?: string[]; nfs?: string[]
}) {
  const fl = freteLabel(frete)
  const temOrigem = tipo === 'nota_fiscal' && !!origem?.length
  const temNfs = tipo !== 'nota_fiscal' && !!nfs?.length
  if (tipo !== 'nota_fiscal' && !fl && !temNfs) return null
  return (
    <>
      {tipo === 'nota_fiscal' ? (
        <View className="px-1.5 py-0.5 rounded bg-surface-elev border border-surface-border">
          <Text className="text-xs font-bold text-ink">NF</Text>
        </View>
      ) : null}
      {temOrigem ? (
        <View className="px-1.5 py-0.5 rounded border border-surface-border">
          <Text className="text-xs text-ink-subtle">ped. {origem!.join(', ')}</Text>
        </View>
      ) : null}
      {temNfs ? (
        <View className="px-1.5 py-0.5 rounded bg-amber-500/15">
          <Text className="text-xs font-semibold text-amber-300">NF {nfs!.join(', ')}</Text>
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
