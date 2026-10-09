import { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { agoraApi, type AgoraPainel } from '@/lib/api'

/**
 * Agora no galpão (observabilidade, 2026-10-08) — paridade com /supervisor/agora do web.
 * Quem está conferindo o quê, quem parou de bipar, filas e sequências. Atualiza a cada 15 s.
 */

const INTERVALO_MS = 15_000

function min(m: number | null): string {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

function nomeDoc(tipo: string) {
  return tipo === 'nota_fiscal' ? 'NF' : 'Pedido'
}

export default function Agora() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [d, setD] = useState<AgoraPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setD(await agoraApi.painel())
      setErro(null)
    } catch {
      setErro('Sem resposta da API.')
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, INTERVALO_MS)
    return () => clearInterval(t)
  }, [carregar])

  const f = d?.filas
  const FILAS = f ? [
    { rotulo: 'Sem sequência', valor: f.selecionados_sem_sequencia, href: '/supervisor/patio', alerta: f.selecionados_sem_sequencia > 0 },
    { rotulo: 'Atribuídos', valor: f.atribuidos, href: '/supervisor/patio', sub: f.atribuido_mais_antigo_min !== null ? `há ${min(f.atribuido_mais_antigo_min)}` : undefined, alerta: (f.atribuido_mais_antigo_min ?? 0) >= (d?.sem_iniciar_apos_min ?? 30) },
    { rotulo: 'Em conferência', valor: f.em_conferencia, href: '/supervisor/patio', alerta: false },
    { rotulo: 'Fechamentos', valor: f.aguardando_fechamento, href: '/supervisor/patio', alerta: f.aguardando_fechamento > 0 },
    { rotulo: 'Não conformes', valor: f.nao_conformes, href: '/supervisor/nao-conformes', alerta: f.nao_conformes > 0 },
    { rotulo: 'Cancelados', valor: f.cancelados_a_transferir, href: '/supervisor/cancelados', alerta: f.cancelados_a_transferir > 0 },
    { rotulo: 'Etiquetas', valor: f.etiquetas_prontas, href: '/supervisor/etiquetas', sub: f.etiquetas_aguardando_transportadora > 0 ? `${f.etiquetas_aguardando_transportadora} aguardando` : undefined, alerta: false },
    { rotulo: 'Conferidos hoje', valor: f.conferidos_hoje, href: '/supervisor/conferidos', sub: `${f.conferidos_1h} na última hora`, alerta: false },
  ] : []

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Agora" />
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
          {erro && <Text className="text-sm text-red-500">{erro}</Text>}

          {d && (
            <>
              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-widest">
                Conferentes em ação · {d.filas.bips_1h} bips na última hora
              </Text>
              {d.conferentes.length === 0 ? (
                <Text className="text-sm text-ink-subtle">Ninguém com documento na mão agora.</Text>
              ) : d.conferentes.map((c) => {
                const p = c.em_conferencia
                const pct = p && p.qtd_pedida > 0 ? Math.min(100, Math.round((p.qtd_separada / p.qtd_pedida) * 100)) : 0
                return (
                  <View key={c.conferente} className={`bg-surface-card rounded-xl border p-3 ${c.parado ? 'border-red-400' : 'border-surface-border'}`}>
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-ink">{c.conferente}</Text>
                      <Text className="text-xs text-ink-subtle">{c.bips_1h} bips/h · {c.conferidos_hoje} hoje</Text>
                    </View>
                    {p ? (
                      <>
                        <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                          <Text className="text-sm font-medium text-ink">{nomeDoc(p.tipo)} {p.numero_externo}</Text>
                          {p.sequencia ? <Text className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">seq. {p.sequencia}</Text> : null}
                          {c.parado ? (
                            <Text className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">sem bip há {min(p.sem_bip_min)}</Text>
                          ) : null}
                        </View>
                        <Text className="text-sm text-ink-muted" numberOfLines={1}>{p.cliente || '—'}</Text>
                        <View className="mt-2 h-2 rounded-full bg-surface-elev overflow-hidden">
                          <View className={`h-full ${c.parado ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                        </View>
                        <Text className="text-xs text-ink-subtle mt-1">
                          {p.qtd_separada}/{p.qtd_pedida} unidades · começou há {min(p.ha_min)}
                        </Text>
                      </>
                    ) : (
                      <Text className="text-sm text-ink-muted mt-1">Sem documento aberto</Text>
                    )}
                    {c.atribuidos > 0 ? <Text className="text-xs text-ink-subtle mt-1">+ {c.atribuidos} atribuído(s) na fila dele</Text> : null}
                  </View>
                )
              })}

              {d.sem_iniciar.length > 0 ? (
                <View className="bg-amber-50 dark:bg-amber-950 border border-amber-300 rounded-xl p-3">
                  <Text className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Atribuídos há mais de {d.sem_iniciar_apos_min} min sem iniciar
                  </Text>
                  {d.sem_iniciar.map((p) => (
                    <Text key={p.id} className="text-sm text-ink mt-1">
                      {nomeDoc(p.tipo)} {p.numero_externo} · {p.conferente ?? 'sem conferente'} · há {min(p.ha_min)}
                    </Text>
                  ))}
                </View>
              ) : null}

              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-widest mt-2">Filas</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {FILAS.map((x) => (
                  <Pressable
                    key={x.rotulo}
                    onPress={() => router.replace(x.href as never)}
                    className={`bg-surface-card rounded-xl border p-3 ${x.alerta ? 'border-red-400' : 'border-surface-border'}`}
                    style={{ width: '48%' }}
                  >
                    <Text className="font-display text-3xl text-ink">{x.valor}</Text>
                    <Text className="text-sm text-ink mt-1">{x.rotulo}</Text>
                    {x.sub ? <Text className="text-xs text-ink-subtle">{x.sub}</Text> : null}
                  </Pressable>
                ))}
              </View>

              <Text className="text-xs font-semibold text-ink-subtle uppercase tracking-widest mt-2">Sequências abertas</Text>
              {d.sequencias.length === 0 ? (
                <Text className="text-sm text-ink-subtle">Nenhuma sequência aberta.</Text>
              ) : d.sequencias.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => router.push(`/supervisor/sequencia/${s.id}` as never)}
                  className="bg-surface-card rounded-xl border border-surface-border p-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="font-semibold text-ink">Sequência {s.numero}</Text>
                    <Text className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">{s.status === 'aberta' ? 'aberta' : 'em andamento'}</Text>
                  </View>
                  <View className="mt-2 h-2 rounded-full bg-surface-elev overflow-hidden flex-row">
                    {s.total > 0 ? (
                      <>
                        <View className="bg-emerald-500 h-full" style={{ width: `${(s.finalizados / s.total) * 100}%` }} />
                        <View className="bg-blue-500 h-full" style={{ width: `${(s.em_conferencia / s.total) * 100}%` }} />
                        <View className="bg-amber-400 h-full" style={{ width: `${(s.atribuidos / s.total) * 100}%` }} />
                      </>
                    ) : null}
                  </View>
                  <Text className="text-xs text-ink-subtle mt-1">
                    {s.finalizados} finalizados · {s.em_conferencia} conferindo · {s.atribuidos} atribuídos · {s.selecionados} a atribuir · {s.total} no total
                  </Text>
                  {s.conferentes.length > 0 ? <Text className="text-xs text-ink-muted mt-1">{s.conferentes.join(', ')}</Text> : null}
                </Pressable>
              ))}

              <Text className="text-xs text-ink-subtle mt-2">
                Hoje: {d.filas.bips_hoje} bips · {d.filas.conferidos_hoje} conferidos · {d.filas.divergencias_hoje} códigos divergentes · {d.filas.cancelados_hoje} cancelados
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}
