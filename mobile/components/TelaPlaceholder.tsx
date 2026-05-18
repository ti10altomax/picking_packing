import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Header } from './Header'

export function TelaPlaceholder({
  titulo,
  descricao,
}: {
  titulo: string
  descricao?: string
}) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title={titulo} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-2xl font-bold text-ink mb-2">Em construção</Text>
        {descricao ? (
          <Text className="text-sm text-ink-subtle text-center">{descricao}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
