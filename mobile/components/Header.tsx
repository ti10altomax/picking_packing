import { View, Text, Pressable, Linking } from 'react-native'
import { useRouter, usePathname } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'
import { API_URL } from '@/lib/api'
import { ThemeToggle } from '@/components/ThemeToggle'

/**
 * Rota do app → chave da ajuda no manual do web (`frontend/content/ajuda`).
 * O "?" abre `/ajuda#chave` no navegador do aparelho — o manual é um só,
 * mantido no web; o app não duplica texto. Rotas iguais às do web, exceto a
 * sequência (/supervisor/sequencia/[id] aqui, /supervisor/patio/[id] lá).
 *
 * A URL aberta é `API_URL/ajuda` de propósito: o app só conhece a API, e em
 * produção a :8003 é o Django direto. O backend redireciona para o web
 * (`SEPARA_WEB_URL`, view `ajuda_redirect`), levando a query e o #chave.
 */
function chaveAjuda(pathname: string): string {
  const p = pathname.replace(/\/+$/, '')
  if (/^\/conferencia\/[^/]+$/.test(p)) return 'conferencia-pedido'
  if (p === '/conferencia') return 'conferencia'
  if (/^\/supervisor\/sequencia\/[^/]+$/.test(p)) return 'supervisor-sequencia'
  if (p.startsWith('/supervisor/')) return 'supervisor-' + p.slice('/supervisor/'.length).split('/')[0]
  if (p.startsWith('/admin')) return 'admin'
  return ''
}

export function Header({ title }: { title: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()

  async function handleLogout() {
    await logout()
    router.replace('/login')
  }

  function abrirAjuda() {
    const chave = chaveAjuda(pathname)
    const url = `${API_URL}/ajuda${user?.perfil ? `?perfil=${user.perfil}` : ''}${chave ? `#${chave}` : ''}`
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View className="bg-surface-card border-b border-surface-border px-4 h-14 flex-row items-center justify-between">
      <View className="flex-row items-baseline gap-2 flex-1 mr-2">
        {/* Logotipo = botão de "casa" do perfil (padrão do web) */}
        <Pressable onPress={() => router.replace(destinoPorPerfil(user?.perfil) as never)} hitSlop={8}>
          <Text className="font-display-italic text-xl text-ink">Separa</Text>
        </Pressable>
        <Text className="text-ink-subtle">·</Text>
        <Text className="text-base text-ink-muted flex-1" numberOfLines={1}>{title}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text className="text-sm text-ink-muted">{user?.username}</Text>
        {/* Ajuda desta tela — abre o manual no navegador (manual embutido, 2026-10-29) */}
        <Pressable onPress={abrirAjuda} className="h-11 w-11 items-center justify-center" accessibilityLabel="Ajuda desta tela">
          <View className="h-6 w-6 rounded-full border-2 border-ink-muted items-center justify-center">
            <Text className="text-ink-muted text-[13px] font-bold leading-none">?</Text>
          </View>
        </Pressable>
        <ThemeToggle />
        <Pressable onPress={handleLogout} className="px-2 h-11 items-center justify-center">
          <Text className="text-sm text-ink-subtle">Sair</Text>
        </Pressable>
      </View>
    </View>
  )
}
