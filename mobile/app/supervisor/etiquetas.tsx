import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { DocBadges } from '@/components/DocBadges'
import { EscolherImpressora } from '@/components/EscolherImpressora'
import { impressaoApi, type EtiquetaPendente } from '@/lib/api'

/**
 * Etiquetas de volume pendentes (ponto 7) — paridade com /supervisor/etiquetas do web.
 * "Prontas" têm transportadora; "Aguardando" saem sozinhas quando o Senior preencher.
 */

function fmt(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Etiquetas() {
  const insets = useSafeAreaInsets()
  const [prontas, setProntas] = useState<EtiquetaPendente[]>([])
  const [aguardando, setAguardando] = useState<EtiquetaPendente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [padraoNome, setPadraoNome] = useState<string | null>(null)
  const [automatica, setAutomatica] = useState(true)
  const [pedidoImprimir, setPedidoImprimir] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([impressaoApi.pendentes(), impressaoApi.impressoras()])
      setProntas(p.prontas)
      setAguardando(p.aguardando_transportadora)
      setPadraoNome(i.impressoras.find((x) => x.id === i.impressora_padrao)?.nome ?? null)
      setAutomatica(i.automatica)
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Etiquetas" />
      <SupervisorNav />

      {carregando ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 8 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); carregar() }} tintColor="#a1a1aa" />
          }
        >
          <Text className="text-sm text-ink-muted mb-1">
            Automática <Text className="text-ink">{automatica ? 'ligada' : 'desligada'}</Text> · padrão{' '}
            <Text className="text-ink">{padraoNome ?? 'nenhuma'}</Text>
          </Text>

          <Text className="text-[11px] font-semibold tracking-[2px] text-ink-subtle mt-2">
            PRONTAS PARA IMPRIMIR · {prontas.length}
          </Text>
          {prontas.length === 0 ? (
            <Text className="text-ink-subtle text-sm text-center py-6">Nada pendente.</Text>
          ) : prontas.map((p) => (
            <Linha key={p.id} p={p} onImprimir={() => setPedidoImprimir(p.id)} />
          ))}

          <Text className="text-[11px] font-semibold tracking-[2px] text-ink-subtle mt-4">
            AGUARDANDO TRANSPORTADORA · {aguardando.length}
          </Text>
          <Text className="text-xs text-ink-subtle mb-1">
            Entregas conferidas sem transportadora no Senior ainda. A etiqueta sai sozinha quando ela chegar.
          </Text>
          {aguardando.length === 0 ? (
            <Text className="text-ink-subtle text-sm text-center py-6">Nenhuma.</Text>
          ) : aguardando.map((p) => <Linha key={p.id} p={p} />)}
        </ScrollView>
      )}

      <EscolherImpressora
        visible={pedidoImprimir !== null}
        pedidoId={pedidoImprimir}
        onClose={() => setPedidoImprimir(null)}
        onImpresso={carregar}
      />
    </SafeAreaView>
  )
}

function Linha({ p, onImprimir }: { p: EtiquetaPendente; onImprimir?: () => void }) {
  return (
    <View className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex-row items-start gap-3">
      <View className="flex-1">
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="font-bold text-ink">{p.numero_externo}</Text>
          <DocBadges tipo={p.tipo} frete={p.frete} />
          <Text className="text-xs text-ink-subtle">{p.qtd_volumes} vol.</Text>
        </View>
        <Text className="text-sm text-ink-muted" numberOfLines={1}>{p.cliente || '—'}</Text>
        <Text className="text-xs text-ink-subtle mt-0.5" numberOfLines={2}>
          {p.transportadora
            ? <Text className="text-ink">{p.transportadora}</Text>
            : <Text className="text-amber-400">sem transportadora</Text>}
          {p.conferido_em ? ` · ${fmt(p.conferido_em)}` : ''}
          {p.conferente ? ` · ${p.conferente}` : ''}
        </Text>
        {p.ultimo_erro ? (
          <Text className="text-xs text-red-400 mt-0.5" numberOfLines={2}>última tentativa: {p.ultimo_erro}</Text>
        ) : null}
      </View>
      {onImprimir ? (
        <Pressable
          onPress={onImprimir}
          className="h-11 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 items-center justify-center"
        >
          <Text className="text-emerald-300 text-sm font-semibold">Imprimir</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
