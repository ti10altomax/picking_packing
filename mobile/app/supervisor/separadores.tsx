import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Header } from '@/components/Header'
import { SupervisorNav } from '@/components/SupervisorNav'
import { useDialog } from '@/components/Dialog'
import { separadoresApi, SeparadorCadastro } from '@/lib/api'

const TIPO_LABEL: Record<string, string> = { extra: 'Extra', funcionario: 'Funcionário' }

export default function SupervisorSeparadores() {
  const dialog = useDialog()
  const [lista, setLista] = useState<SeparadorCadastro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [agindo, setAgindo] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cadastro rápido
  const [novoNome, setNovoNome] = useState('')
  const [novoApelido, setNovoApelido] = useState('')
  const [novoTipo, setNovoTipo] = useState<'extra' | 'funcionario'>('extra')
  const [cadastrando, setCadastrando] = useState(false)

  const carregar = useCallback(async (search: string) => {
    setCarregando(true)
    try {
      const data = await separadoresApi.listar(search ? { search } : {})
      setLista(data)
    } finally {
      setCarregando(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { carregar('') }, [carregar])

  function aoBuscar(texto: string) {
    setBusca(texto)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(texto.trim()), 300)
  }

  async function cadastrar() {
    const nome = novoNome.trim()
    if (!nome) return
    setCadastrando(true)
    try {
      await separadoresApi.criar({ nome, apelido: novoApelido.trim(), tipo: novoTipo })
      setNovoNome('')
      setNovoApelido('')
      setNovoTipo('extra')
      await carregar(busca.trim())
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível cadastrar.' })
    } finally {
      setCadastrando(false)
    }
  }

  async function alternarLiberacao(s: SeparadorCadastro) {
    setAgindo(s.id)
    try {
      if (s.liberado_hoje) await separadoresApi.desliberar([s.id])
      else await separadoresApi.liberar([s.id])
      setLista((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, liberado_hoje: !s.liberado_hoje } : x)),
      )
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível atualizar a liberação.' })
    } finally {
      setAgindo(null)
    }
  }

  async function alternarAtivo(s: SeparadorCadastro) {
    if (s.ativo) {
      const ok = await dialog.confirm({
        variant: 'danger',
        title: 'Desativar separador?',
        message: `${s.apelido || s.nome} não aparecerá mais nas listas. O histórico é mantido.`,
        confirmText: 'Desativar',
        cancelText: 'Voltar',
      })
      if (!ok) return
    }
    setAgindo(s.id)
    try {
      const atualizado = await separadoresApi.atualizar(s.id, { ativo: !s.ativo })
      setLista((prev) => prev.map((x) => (x.id === s.id ? atualizado : x)))
    } catch {
      await dialog.alert({ variant: 'danger', title: 'Erro', message: 'Não foi possível atualizar.' })
    } finally {
      setAgindo(null)
    }
  }

  const liberadosHoje = lista.filter((s) => s.ativo && s.liberado_hoje).length

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface-bg">
      <Header title="Separadores" />
      <SupervisorNav />

      <View className="px-4 pt-3 pb-2">
        <Text className="text-sm text-ink-muted">
          Cadastro e liberação do dia ·{' '}
          <Text className="font-semibold text-emerald-400">
            {liberadosHoje} liberado{liberadosHoje === 1 ? '' : 's'} hoje
          </Text>
        </Text>
      </View>

      {/* Cadastro rápido */}
      <View className="mx-4 mb-3 bg-surface-card border border-surface-border rounded-xl p-3 gap-2">
        <View className="flex-row gap-2">
          <TextInput
            value={novoNome}
            onChangeText={setNovoNome}
            placeholder="Nome *"
            placeholderTextColor="#71717a"
            className="flex-1 h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm"
          />
          <TextInput
            value={novoApelido}
            onChangeText={setNovoApelido}
            placeholder="Apelido"
            placeholderTextColor="#71717a"
            className="flex-1 h-11 px-3 rounded-lg bg-surface-elev border border-surface-border text-ink text-sm"
          />
        </View>
        <View className="flex-row gap-2">
          {(['extra', 'funcionario'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setNovoTipo(t)}
              className={`flex-1 h-10 rounded-lg border items-center justify-center ${
                novoTipo === t ? 'border-blue-500 bg-blue-500/15' : 'border-surface-border'
              }`}
            >
              <Text className={`text-xs font-semibold ${novoTipo === t ? 'text-blue-300' : 'text-ink-muted'}`}>
                {TIPO_LABEL[t]}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={cadastrar}
            disabled={cadastrando || !novoNome.trim()}
            className={`h-10 px-4 rounded-lg items-center justify-center ${
              cadastrando || !novoNome.trim() ? 'bg-surface-elev' : 'bg-blue-500 active:bg-blue-400'
            }`}
          >
            <Text className={`text-sm font-semibold ${
              cadastrando || !novoNome.trim() ? 'text-ink-subtle' : 'text-white'
            }`}>
              Cadastrar
            </Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        value={busca}
        onChangeText={aoBuscar}
        placeholder="Buscar por nome, apelido ou documento…"
        placeholderTextColor="#71717a"
        className="mx-4 mb-3 h-11 px-3 rounded-lg bg-surface-card border border-surface-border text-ink text-sm"
      />

      {carregando && lista.length === 0 ? (
        <ActivityIndicator className="mt-12" />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 8 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); carregar(busca.trim()) }}
            />
          }
          ListEmptyComponent={
            <Text className="text-ink-subtle text-center mt-12">Nenhum separador cadastrado.</Text>
          }
          renderItem={({ item: s }) => (
            <View
              className={`bg-surface-card border border-surface-border rounded-xl p-3 flex-row items-center gap-2 ${
                !s.ativo ? 'opacity-50' : ''
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="font-semibold text-ink">{s.apelido || s.nome}</Text>
                  <Text className="text-xs px-2 py-0.5 rounded-full bg-surface-elev text-ink-muted">
                    {TIPO_LABEL[s.tipo] ?? s.tipo}
                  </Text>
                  {!s.ativo && (
                    <Text className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                      inativo
                    </Text>
                  )}
                </View>
                {!!s.apelido && (
                  <Text className="text-xs text-ink-subtle" numberOfLines={1}>{s.nome}</Text>
                )}
              </View>

              {s.ativo && (
                <Pressable
                  onPress={() => alternarLiberacao(s)}
                  disabled={agindo === s.id}
                  className={`h-11 px-3 rounded-lg items-center justify-center ${
                    s.liberado_hoje ? 'bg-emerald-600' : 'bg-surface-elev border border-surface-border'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${s.liberado_hoje ? 'text-white' : 'text-ink-muted'}`}>
                    {s.liberado_hoje ? '✓ Liberado' : 'Liberar hoje'}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => alternarAtivo(s)}
                disabled={agindo === s.id}
                className="h-11 px-2 items-center justify-center"
              >
                <Text className="text-xs text-ink-subtle">{s.ativo ? 'Desativar' : 'Reativar'}</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}
