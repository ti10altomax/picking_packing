import { ScrollView, Pressable, Text } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'

type Aba = {
  href: string
  label: string
  perfis?: Array<'supervisor_vendas' | 'supervisor_patio' | 'admin'>
}

const ABAS: Aba[] = [
  { href: '/supervisor/vendas', label: 'Vendas', perfis: ['supervisor_vendas', 'admin'] },
  { href: '/supervisor/patio', label: 'Pátio', perfis: ['supervisor_patio', 'admin'] },
  { href: '/supervisor/separadores', label: 'Separadores', perfis: ['supervisor_patio', 'admin'] },
  { href: '/supervisor/conferidos', label: 'Conferidos' },
  { href: '/supervisor/nao-conformes', label: 'Não conformes' },
  { href: '/supervisor/erros', label: 'Erros' },
]

export function SupervisorNav() {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuthStore()

  const abasVisiveis = ABAS.filter(
    (a) => !a.perfis || a.perfis.includes(user?.perfil as never),
  )

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8, gap: 6, alignItems: 'center' }}
      className="bg-surface-card border-b border-surface-border"
      style={{ flexGrow: 0 }}
    >
      {abasVisiveis.map((a) => {
        const ativo = pathname === a.href || pathname?.startsWith(a.href + '/')
        return (
          <Pressable
            key={a.href}
            onPress={() => router.replace(a.href as never)}
            className={`px-3 my-2 h-9 rounded-lg items-center justify-center ${
              ativo ? 'bg-zinc-100' : 'bg-transparent'
            }`}
          >
            <Text className={`text-sm font-medium ${
              ativo ? 'text-zinc-900' : 'text-ink-muted'
            }`}>
              {a.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
