import { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { errosApi, ErroSeparacaoResumo, ErroSeparacaoItem } from '@/lib/api'

type FiltroTipo = '' | 'a_mais' | 'a_menos'

export default function SupervisorErros() {
  const [resumo, setResumo] = useState<ErroSeparacaoResumo[]>([])
  const [erros, setErros] = useState<ErroSeparacaoItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tipo, setTipo] = useState<FiltroTipo>('')
  const [separador, setSeparador] = useState('')

  const carregar = useCallback(async () => {
    try {
      const data = await errosApi.listar({
        ...(tipo ? { tipo } : {}),
        ...(separador ? { separador } : {}),
      })
      setResumo(data.resumo)
      setErros(data.erros)
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [tipo, separador])

  useEffect(() => { carregar() }, [carregar])

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Erros de separação" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2 flex-row gap-2">
        {([['', 'Tudo'], ['a_mais', 'Sobras'], ['a_menos', 'Faltas']] as [FiltroTipo, string][]).map(([v, label]) => (
          <Pressable
            key={v}
            onPress={() => setTipo(v)}
            className={`h-9 px-4 rounded-lg items-center justify-center border ${
              tipo === v ? 'bg-zinc-100 border-zinc-100' : 'border-surface-border'
            }`}
          >
            <Text className={`text-sm font-medium ${tipo === v ? 'text-zinc-900' : 'text-ink-muted'}`}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {carregando && resumo.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#a1a1aa" />
        </View>
      ) : (
        <FlatList
          data={erros}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 6 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar() }}
              tintColor="#a1a1aa"
            />
          }
          ListHeaderComponent={
            <View className="mb-3">
              <Text className="text-xs font-bold text-ink uppercase tracking-wide mb-2">Por separador</Text>
              {resumo.length === 0 ? (
                <Text className="text-sm text-ink-subtle mb-2">Nenhum erro registrado.</Text>
              ) : (
                <View className="bg-surface-card border border-surface-border rounded-xl overflow-hidden mb-3">
                  {resumo.map((r) => {
                    const chave = r.separador_id === null ? 'nao_identificado' : String(r.separador_id)
                    const ativo = separador === chave
                    return (
                      <Pressable
                        key={chave}
                        onPress={() => setSeparador(ativo ? '' : chave)}
                        className={`flex-row items-center px-3 py-2.5 border-b border-surface-border ${
                          ativo ? 'bg-blue-500/10' : 'active:bg-surface-elev'
                        }`}
                      >
                        <Text
                          className={`flex-1 text-sm font-medium ${
                            r.nao_identificado ? 'text-amber-400' : 'text-ink'
                          }`}
                          numberOfLines={1}
                        >
                          {r.nao_identificado ? '⚠ Não identificado' : r.nome}
                        </Text>
                        <Text className="text-xs text-amber-300 w-14 text-right">↑{r.sobras}</Text>
                        <Text className="text-xs text-red-300 w-14 text-right">↓{r.faltas}</Text>
                        <Text className="text-sm font-bold text-ink w-12 text-right">{r.total}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              )}
              <Text className="text-xs font-bold text-ink uppercase tracking-wide">
                Ocorrências{separador ? ' (filtradas)' : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center py-8">Nenhuma ocorrência com esses filtros.</Text>
          }
          renderItem={({ item: e }) => (
            <View className="bg-surface-card border border-surface-border rounded-xl px-3 py-2.5">
              <View className="flex-row items-center gap-2 flex-wrap">
                <View className={`px-2 py-0.5 rounded-full ${e.tipo === 'a_mais' ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
                  <Text className={`text-xs font-medium ${e.tipo === 'a_mais' ? 'text-amber-300' : 'text-red-300'}`}>
                    {e.tipo === 'a_mais' ? 'Sobra' : 'Falta'}
                  </Text>
                </View>
                <Text className="text-sm font-bold text-ink">{e.qtd}×</Text>
                <Text className="text-sm text-ink flex-1" numberOfLines={1}>
                  {e.descricao || e.sku || 'item'}
                </Text>
              </View>
              <Text className="text-xs text-ink-subtle mt-1">
                pedido {e.numero_externo}
                {e.separador ? ` · ${e.separador}` : ' · não identificado'}
                {' · '}
                {new Date(e.criado_em).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}
