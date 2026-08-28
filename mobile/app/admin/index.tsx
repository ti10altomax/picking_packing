import { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Link } from 'expo-router'
import { Header } from '@/components/Header'
import { useAuthStore } from '@/stores/authStore'
import {
  pedidosApi, supervisorApi, separadoresApi, fechamentosApi,
} from '@/lib/api'

type Contadores = {
  pendentes: number | null
  aguardandoSequencia: number | null
  liberadosHoje: number | null
  emConferencia: number | null
  naoConformes: number | null
  fechamentos: number | null
  conferidos: number | null
}

const VAZIO: Contadores = {
  pendentes: null, aguardandoSequencia: null, liberadosHoje: null,
  emConferencia: null, naoConformes: null, fechamentos: null, conferidos: null,
}

function contar(data: { count?: number } | unknown[]): number {
  return Array.isArray(data) ? data.length : (data.count ?? 0)
}

function Contador({ valor, cor }: { valor: number | null; cor?: string }) {
  return (
    <Text className={`font-display text-4xl leading-tight ${cor ?? 'text-ink'}`}>
      {valor === null ? '–' : valor}
    </Text>
  )
}

export default function AdminHome() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const [c, setC] = useState<Contadores>(VAZIO)
  const [refreshing, setRefreshing] = useState(false)

  function carregar() {
    const definir = (chave: keyof Contadores) => (v: number) =>
      setC((prev) => ({ ...prev, [chave]: v }))

    Promise.allSettled([
      pedidosApi.listar({ status: 'pendente' }).then((d) => definir('pendentes')(contar(d))),
      supervisorApi.listarSelecionados({ sem_sequencia: '1' }).then((d) => definir('aguardandoSequencia')(contar(d))),
      separadoresApi.liberados().then((d) => definir('liberadosHoje')(d.length)),
      pedidosApi.listar({ status: 'conferindo' }).then((d) => definir('emConferencia')(contar(d))),
      supervisorApi.listarNaoConformes().then((d) => definir('naoConformes')(contar(d))),
      fechamentosApi.listar().then((d) => definir('fechamentos')(d.length)),
      supervisorApi.listarConferidos().then((d) => definir('conferidos')(contar(d))),
    ]).finally(() => setRefreshing(false))
  }

  useEffect(() => { carregar() }, [])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataLonga = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const OPERACAO = [
    {
      href: '/supervisor/vendas', area: 'VENDAS',
      accent: 'text-orange-400', borda: 'border-orange-500/25',
      valor: c.pendentes, unidade: 'pendentes do Senior', titulo: 'Selecionar pedidos',
    },
    {
      href: '/supervisor/patio', area: 'PÁTIO',
      accent: 'text-amber-400', borda: 'border-amber-500/25',
      valor: c.aguardandoSequencia, unidade: 'aguardando sequência', titulo: 'Montar sequências',
    },
    {
      href: '/supervisor/separadores', area: 'PÁTIO',
      accent: 'text-violet-400', borda: 'border-violet-500/25',
      valor: c.liberadosHoje, unidade: 'liberados hoje', titulo: 'Separadores do dia',
    },
    {
      href: '/conferencia', area: 'CONFERÊNCIA',
      accent: 'text-blue-400', borda: 'border-blue-500/25',
      valor: c.emConferencia, unidade: 'em conferência agora', titulo: 'Conferir pedidos',
    },
  ]

  const GESTAO = [
    {
      href: '/supervisor/nao-conformes', titulo: 'Não conformes',
      valor: c.naoConformes, alerta: (c.naoConformes ?? 0) > 0, cor: 'text-red-400',
    },
    {
      href: '/supervisor/conferidos', titulo: 'Conferidos',
      valor: c.conferidos, alerta: false, cor: '',
    },
    {
      href: '/supervisor/erros', titulo: 'Erros de separação',
      valor: null, alerta: false, cor: '',
    },
  ]

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Painel" />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setC(VAZIO); carregar() }}
          />
        }
      >
        {/* Saudação */}
        <Text className="font-display text-3xl text-ink leading-tight">
          {saudacao}{user?.username ? `, ${user.username}` : ''}
        </Text>
        <Text className="text-sm text-ink-muted mt-1 mb-6 capitalize">{dataLonga}</Text>

        {/* Fechamentos pendentes — banner de ação (tela é web) */}
        {(c.fechamentos ?? 0) > 0 && (
          <View className="border border-violet-500/40 bg-violet-500/10 rounded-2xl p-4 mb-4">
            <Text className="text-sm text-violet-300 font-medium">
              {c.fechamentos} pedido(s) com sobra aguardando fechamento — resolver no painel web (Gestão → Fechamentos)
            </Text>
          </View>
        )}

        {/* Operação — contadores vivos */}
        <View className="gap-3 mb-8">
          {OPERACAO.map((card) => (
            <Link key={card.href} href={card.href as never} asChild>
              <Pressable
                className={`bg-surface-card border rounded-2xl p-5 active:opacity-80 ${card.borda}`}
              >
                <Text className={`text-[11px] font-semibold tracking-[2px] ${card.accent}`}>
                  {card.area}
                </Text>
                <View className="flex-row items-baseline gap-2 mt-2">
                  <Contador valor={card.valor} />
                  <Text className="text-xs text-ink-subtle">{card.unidade}</Text>
                </View>
                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-base font-semibold text-ink">{card.titulo}</Text>
                  <Text className="text-ink-subtle text-xl">›</Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>

        {/* Gestão — linha compacta */}
        <Text className="text-[11px] font-semibold tracking-[2px] text-ink-subtle mb-2">GESTÃO</Text>
        <View className="gap-2 mb-6">
          {GESTAO.map((item) => (
            <Link key={item.href} href={item.href as never} asChild>
              <Pressable
                className={`flex-row items-center bg-surface-card border rounded-xl px-4 py-3.5 active:opacity-80 ${
                  item.alerta ? 'border-red-500/40' : 'border-surface-border'
                }`}
              >
                <Text className="text-sm font-medium text-ink flex-1">{item.titulo}</Text>
                {item.valor !== null && item.valor > 0 && (
                  <Text className={`font-display text-lg ${item.alerta ? item.cor : 'text-ink-muted'}`}>
                    {item.valor}
                  </Text>
                )}
              </Pressable>
            </Link>
          ))}
        </View>

        <Text className="text-xs text-ink-subtle text-center">
          Divergências, fechamentos e cadastros avançados ficam no painel web
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}
