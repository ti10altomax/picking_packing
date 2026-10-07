import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import { impressaoApi, type ImpressoraEtiqueta } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

// Última impressora escolhida neste aparelho — conveniência local
const CHAVE_ULTIMA = 'etiqueta_impressora'

/**
 * Seletor de impressora para a etiqueta de volume (Zebra de rede ou USB via
 * agente). No celular/coletor não existe o caminho "navegador" do web.
 */
export function EscolherImpressora({
  visible, pedidoId, titulo, onClose, onImpresso,
}: {
  visible: boolean
  pedidoId: number | null
  titulo?: string
  onClose: () => void
  onImpresso?: () => void
}) {
  const insets = useSafeAreaInsets()
  const dialog = useDialog()
  const [lista, setLista] = useState<ImpressoraEtiqueta[] | null>(null)
  const [escolhida, setEscolhida] = useState<number | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!visible) return
    setErro('')
    setLista(null)
    ;(async () => {
      try {
        const d = await impressaoApi.impressoras()
        setLista(d.impressoras)
        const salva = await SecureStore.getItemAsync(CHAVE_ULTIMA).catch(() => null)
        const idSalva = salva ? Number(salva) : null
        if (idSalva && d.impressoras.some((i) => i.id === idSalva)) setEscolhida(idSalva)
        else setEscolhida(d.impressora_padrao ?? d.impressoras[0]?.id ?? null)
      } catch {
        setLista([])
        setErro('Não foi possível carregar as impressoras')
      }
    })()
  }, [visible])

  async function imprimir() {
    if (!pedidoId || !escolhida) return
    setEnviando(true)
    setErro('')
    try {
      const r = await impressaoApi.imprimir(pedidoId, { impressora_id: escolhida })
      await SecureStore.setItemAsync(CHAVE_ULTIMA, String(escolhida)).catch(() => {})
      onClose()
      onImpresso?.()
      await dialog.alert({
        variant: 'success',
        title: 'Etiquetas enviadas',
        message: `${r.impressao.qtd_etiquetas} etiqueta(s) → ${r.impressao.impressora}`,
      })
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { erro?: string } } })?.response?.data
      setErro(d?.erro ?? 'Falha ao imprimir')
    } finally {
      setEnviando(false)
    }
  }

  if (!visible) return null

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onClose}>
        <Pressable
          className="bg-surface-card border-t border-surface-border rounded-t-2xl px-6 pt-6"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="font-bold text-lg text-ink mb-1">{titulo ?? 'Imprimir etiquetas'}</Text>
          <Text className="text-sm text-ink-muted mb-4">Uma etiqueta 10x15 por volume. Escolha a impressora.</Text>

          {lista === null ? (
            <ActivityIndicator color="#a1a1aa" className="my-6" />
          ) : lista.length === 0 ? (
            <Text className="text-sm text-ink-muted mb-4">
              Nenhuma impressora cadastrada. O admin cadastra em Impressoras (web) ou imprime pelo navegador.
            </Text>
          ) : (
            <View className="gap-2 mb-4">
              {lista.map((i) => {
                const ativa = escolhida === i.id
                return (
                  <Pressable
                    key={i.id}
                    onPress={() => setEscolhida(i.id)}
                    className={`flex-row items-center gap-3 border rounded-xl px-3 min-h-[52px] ${
                      ativa ? 'border-emerald-500 bg-emerald-500/10' : 'border-surface-border bg-surface-card'
                    }`}
                  >
                    <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${ativa ? 'border-emerald-500' : 'border-zinc-500'}`}>
                      {ativa ? <View className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-base text-ink font-medium" numberOfLines={1}>
                        {i.nome}{i.padrao ? <Text className="text-xs text-emerald-400">  PADRÃO</Text> : null}
                      </Text>
                      <Text className="text-xs text-ink-subtle" numberOfLines={1}>
                        {i.tipo_conexao === 'rede' ? `rede ${i.ip ?? ''}` : 'USB via agente'}{i.mesa ? ` · ${i.mesa}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          )}

          {erro ? <Text className="text-sm text-red-400 mb-3">{erro}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable onPress={onClose} className="flex-1 h-12 rounded-xl border border-surface-border items-center justify-center">
              <Text className="text-ink font-medium">Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={imprimir}
              disabled={enviando || !escolhida}
              className={`flex-1 h-12 rounded-xl items-center justify-center ${
                enviando || !escolhida ? 'bg-zinc-600' : 'bg-emerald-600'
              }`}
            >
              <Text className="text-white font-bold">{enviando ? 'Enviando…' : 'Imprimir'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
