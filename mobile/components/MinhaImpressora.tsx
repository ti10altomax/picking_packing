import { useCallback, useState } from 'react'
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useToast } from '@/components/Toast'
import { impressaoApi, type ImpressoraEtiqueta } from '@/lib/api'

/**
 * "Minha impressora" do conferente (2026-11-26). O Pátio tem mais de uma impressora e cada um
 * imprime na que está perto; com a dele escolhida, a etiqueta sai sozinha ao concluir, sem a
 * pergunta de toda conferência. Ele troca aqui quando muda de lado; "Perguntar sempre" volta
 * ao comportamento antigo. O servidor guarda por usuário (vale em qualquer coletor).
 */
export function MinhaImpressora() {
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [lista, setLista] = useState<ImpressoraEtiqueta[] | null>(null)
  const [minha, setMinha] = useState<number | null>(null)
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const d = await impressaoApi.impressoras()
      setLista(d.impressoras)
      setMinha(d.minha ?? null)
    } catch {
      setLista([])
    }
  }, [])

  // recarrega ao voltar para a tela: a primeira impressão escolhida no fim da conferência
  // passa a ser a dele, e a linha tem que mostrar isso
  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  async function escolher(id: number | null) {
    setSalvando(true)
    try {
      const r = await impressaoApi.definirMinhaImpressora(id)
      setMinha(r.impressora?.id ?? null)
      setAberto(false)
      if (r.impressora) toast.ok(`Sua impressora: ${r.impressora.nome}`, { detalhe: 'As etiquetas saem nela ao concluir.' })
      else toast.info('Sem impressora fixa', { detalhe: 'O app volta a perguntar ao concluir.' })
    } catch {
      toast.erro('Não deu para trocar a impressora')
    } finally {
      setSalvando(false)
    }
  }

  if (lista === null || lista.length === 0) return null   // sem impressora cadastrada não há o que escolher
  const atual = lista.find((i) => i.id === minha)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        className="mx-4 mb-2 px-3 h-11 rounded-lg bg-surface-card border border-surface-border flex-row items-center"
      >
        <Text className="flex-1 text-sm text-ink-muted" numberOfLines={1}>
          Minha impressora:{' '}
          <Text className={atual ? 'font-semibold text-ink' : 'text-amber-400'}>
            {atual ? atual.nome : 'nenhuma (pergunta ao concluir)'}
          </Text>
        </Text>
        <Text className="text-sm font-semibold text-blue-400">{atual ? 'Trocar' : 'Escolher'}</Text>
      </Pressable>

      <Modal visible={aberto} animationType="slide" transparent onRequestClose={() => setAberto(false)}>
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setAberto(false)}>
          <Pressable
            className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="font-bold text-lg text-ink mb-1">Minha impressora</Text>
            <Text className="text-sm text-ink-muted mb-4">
              As etiquetas das suas conferências saem nela sozinhas, sem perguntar.
            </Text>
            {salvando ? <ActivityIndicator color="#a1a1aa" className="my-4" /> : (
              <View className="gap-2">
                {lista.map((i) => {
                  const ativa = minha === i.id
                  return (
                    <Pressable
                      key={i.id}
                      onPress={() => escolher(i.id)}
                      className={`flex-row items-center gap-3 border rounded-xl px-3 min-h-[52px] ${
                        ativa ? 'border-emerald-500 bg-emerald-500/10' : 'border-surface-border bg-surface-card'
                      }`}
                    >
                      <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${ativa ? 'border-emerald-500' : 'border-zinc-500'}`}>
                        {ativa ? <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> : null}
                      </View>
                      <View className="flex-1">
                        <Text className="text-base text-ink font-medium" numberOfLines={1}>{i.nome}</Text>
                        {i.mesa ? <Text className="text-xs text-ink-subtle" numberOfLines={1}>{i.mesa}</Text> : null}
                      </View>
                    </Pressable>
                  )
                })}
                <Pressable
                  onPress={() => escolher(null)}
                  className={`flex-row items-center gap-3 border rounded-xl px-3 min-h-[52px] ${
                    minha === null ? 'border-amber-500 bg-amber-500/10' : 'border-surface-border bg-surface-card'
                  }`}
                >
                  <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${minha === null ? 'border-amber-500' : 'border-zinc-500'}`}>
                    {minha === null ? <View className="w-2.5 h-2.5 rounded-full bg-amber-500" /> : null}
                  </View>
                  <Text className="flex-1 text-base text-ink font-medium">Perguntar sempre</Text>
                </Pressable>
              </View>
            )}
            <Pressable onPress={() => setAberto(false)} className="mt-4 h-12 items-center justify-center">
              <Text className="text-ink-muted font-medium">Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}
