import { ScrollView, View, Text, Pressable } from 'react-native'
import { Link } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { useAuthStore } from '@/stores/authStore'

type Card = {
  href: string
  titulo: string
  descricao: string
  emoji: string
  cor: string
}

const CARDS: Card[] = [
  {
    href: '/separacao',
    titulo: 'Minha separação',
    descricao: 'Pedidos atribuídos a mim',
    emoji: '📦',
    cor: 'bg-emerald-500/15 border-emerald-500/30',
  },
  {
    href: '/supervisor/vendas',
    titulo: 'Sup. Vendas',
    descricao: 'Selecionar pedidos para liberar',
    emoji: '🛒',
    cor: 'bg-blue-500/15 border-blue-500/30',
  },
  {
    href: '/supervisor/patio',
    titulo: 'Sup. Pátio',
    descricao: 'Atribuir pedidos a separadores',
    emoji: '🚚',
    cor: 'bg-amber-500/15 border-amber-500/30',
  },
  {
    href: '/supervisor/separados',
    titulo: 'Separados',
    descricao: 'Histórico de pedidos concluídos',
    emoji: '✅',
    cor: 'bg-emerald-500/15 border-emerald-500/30',
  },
  {
    href: '/supervisor/nao-conformes',
    titulo: 'Não conformes',
    descricao: 'Resolver pedidos com problema',
    emoji: '⚠️',
    cor: 'bg-red-500/15 border-red-500/30',
  },
]

export default function AdminHome() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Administração" />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 16,
          gap: 12,
        }}
      >
        <View className="mb-2">
          <Text className="text-xs text-ink-subtle uppercase tracking-wider mb-1">
            Olá, {user?.username}
          </Text>
          <Text className="text-2xl font-bold text-ink">Acesso completo</Text>
          <Text className="text-sm text-ink-muted">
            Escolha o módulo que deseja abrir
          </Text>
        </View>

        {CARDS.map((c) => (
          <Link key={c.href} href={c.href as never} asChild>
            <Pressable className={`border rounded-2xl p-4 active:opacity-80 ${c.cor}`}>
              <View className="flex-row items-center gap-4">
                <Text className="text-3xl">{c.emoji}</Text>
                <View className="flex-1">
                  <Text className="text-base font-bold text-ink">{c.titulo}</Text>
                  <Text className="text-sm text-ink-muted">{c.descricao}</Text>
                </View>
                <Text className="text-ink-subtle text-xl">›</Text>
              </View>
            </Pressable>
          </Link>
        ))}

        <Text className="text-xs text-ink-subtle text-center mt-4">
          Cadastros e relatórios continuam no painel web (Django Admin)
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
