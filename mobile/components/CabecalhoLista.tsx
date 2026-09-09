import { View, Text, ActivityIndicator } from 'react-native'

/**
 * Cabeçalho das listas paginadas do supervisor.
 * Mostra "N de M" normalmente; enquanto uma nova consulta roda com a lista
 * antiga ainda na tela (troca de filtro, busca), mostra um aviso com spinner
 * pra ninguém achar que o app travou.
 */
export function CabecalhoLista({
  carregando, exibidos, total,
}: {
  carregando: boolean
  exibidos: number
  total: number
}) {
  if (carregando) {
    return (
      <View className="flex-row items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-surface-elev border border-surface-border">
        <ActivityIndicator size="small" color="#a1a1aa" />
        <Text className="text-sm text-ink font-medium">Atualizando lista…</Text>
      </View>
    )
  }
  return (
    <Text className="text-xs text-ink-subtle mb-2">
      {exibidos} de {total}
    </Text>
  )
}
