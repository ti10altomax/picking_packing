import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { Animated, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * Toast do app (paridade com o web, 2026-11-05). Para avisos que não pedem resposta — o
 * Dialog continua para confirmação. Feito para o coletor: texto grande, cor sólida, quebra
 * linha, fica no topo e não tira o foco da barra de bipagem (o DataWedge continua digitando
 * no TextInput por baixo). Tocar no toast fecha.
 *
 *   const toast = useToast()
 *   toast.erro('Documento não encontrado no Separa', { codigo: lido, chave: 'leitor' })
 *
 * `chave` substitui o toast anterior com a mesma chave em vez de empilhar.
 */

export type ToastTipo = 'ok' | 'erro' | 'aviso' | 'info'

export type ToastOpcoes = {
  detalhe?: string
  /** código lido pelo leitor/câmera — aparece em mono para o conferente conferir o que bipou */
  codigo?: string
  /** ms; padrão por tipo (erro 6 s, aviso 5 s, ok/info 3,5 s) */
  duracao?: number
  chave?: string
}

type Item = ToastOpcoes & { id: number; tipo: ToastTipo; titulo: string; duracao: number }

type ToastApi = {
  ok: (titulo: string, op?: ToastOpcoes) => number
  erro: (titulo: string, op?: ToastOpcoes) => number
  aviso: (titulo: string, op?: ToastOpcoes) => number
  info: (titulo: string, op?: ToastOpcoes) => number
  fechar: (id: number) => void
}

const DURACAO: Record<ToastTipo, number> = { erro: 6000, aviso: 5000, ok: 3500, info: 3500 }
const MAX_VISIVEIS = 3

const ESTILO: Record<ToastTipo, { caixa: string; texto: string; icone: string; simbolo: string; barra: string }> = {
  erro: { caixa: 'bg-red-600', texto: 'text-white', icone: 'bg-white/20', simbolo: '!', barra: 'bg-white/60' },
  aviso: { caixa: 'bg-amber-400', texto: 'text-zinc-950', icone: 'bg-zinc-950/15', simbolo: '!', barra: 'bg-zinc-950/40' },
  ok: { caixa: 'bg-emerald-600', texto: 'text-white', icone: 'bg-white/20', simbolo: '✓', barra: 'bg-white/60' },
  info: { caixa: 'bg-zinc-800', texto: 'text-white', icone: 'bg-white/15', simbolo: 'i', barra: 'bg-white/50' },
}

const Ctx = createContext<ToastApi | null>(null)
// Lista atual — separada da API para o `ToastHost` poder ser montado também dentro de um
// Modal (a câmera contínua): um Modal nativo cobre o host da raiz (2026-11-09).
const ItensCtx = createContext<{ itens: Item[]; fechar: (id: number) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<Item[]>([])
  const idRef = useRef(0)
  const insets = useSafeAreaInsets()

  const fechar = useCallback((id: number) => setItens((s) => s.filter((t) => t.id !== id)), [])

  const api = useMemo<ToastApi>(() => {
    const abrir = (tipo: ToastTipo) => (titulo: string, op: ToastOpcoes = {}) => {
      const id = ++idRef.current
      const item: Item = { ...op, id, tipo, titulo, duracao: op.duracao ?? DURACAO[tipo] }
      setItens((s) => {
        const resto = op.chave ? s.filter((t) => t.chave !== op.chave) : s
        return [...resto, item].slice(-MAX_VISIVEIS)
      })
      return id
    }
    return { ok: abrir('ok'), erro: abrir('erro'), aviso: abrir('aviso'), info: abrir('info'), fechar }
  }, [fechar])

  const estado = useMemo(() => ({ itens, fechar }), [itens, fechar])
  return (
    <Ctx.Provider value={api}>
      <ItensCtx.Provider value={estado}>
        {children}
        <ToastHost />
      </ItensCtx.Provider>
    </Ctx.Provider>
  )
}

/** Camada que desenha os toasts. A raiz já tem um; um Modal que precise mostrar toasts
 *  por cima de si (câmera contínua) monta outro dentro dele. */
export function ToastHost({ topo }: { topo?: number } = {}) {
  const insets = useSafeAreaInsets()
  const estado = useContext(ItensCtx)
  if (!estado) return null
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: topo ?? insets.top + 60, zIndex: 70, elevation: 70 }}
      className="px-3 gap-2"
    >
      {estado.itens.map((t) => <ToastUI key={t.id} item={t} fechar={estado.fechar} />)}
    </View>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return ctx
}

function ToastUI({ item, fechar }: { item: Item; fechar: (id: number) => void }) {
  const e = ESTILO[item.tipo]
  const entrada = useRef(new Animated.Value(0)).current
  const tempo = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    Animated.timing(tempo, { toValue: 0, duration: item.duracao, useNativeDriver: false }).start()
    const t = setTimeout(() => fechar(item.id), item.duracao)
    return () => clearTimeout(t)
  }, [entrada, tempo, item.id, item.duracao, fechar])

  return (
    <Animated.View
      style={{
        opacity: entrada,
        transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        elevation: 8,
      }}
      className={`rounded-2xl overflow-hidden ${e.caixa}`}
      accessibilityRole="alert"
      accessibilityLiveRegion={item.tipo === 'erro' ? 'assertive' : 'polite'}
    >
      <Pressable onPress={() => fechar(item.id)} className="flex-row items-start px-4 py-3.5" accessibilityHint="Toque para fechar">
        <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 mt-0.5 ${e.icone}`}>
          <Text className={`text-base font-black ${e.texto}`}>{e.simbolo}</Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text className={`text-[17px] font-bold leading-snug ${e.texto}`}>
            {item.titulo.charAt(0).toUpperCase() + item.titulo.slice(1)}
          </Text>
          {item.detalhe ? <Text className={`text-sm leading-snug mt-1 opacity-90 ${e.texto}`}>{item.detalhe}</Text> : null}
          {item.codigo ? (
            <Text className={`text-xs mt-1.5 opacity-80 ${e.texto}`}>
              lido: <Text className="font-mono text-[13px]">{item.codigo}</Text>
            </Text>
          ) : null}
        </View>
        <Text className={`text-xl ml-2 opacity-70 ${e.texto}`}>×</Text>
      </Pressable>
      <Animated.View
        className={`h-1 ${e.barra}`}
        style={{ width: tempo.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}
      />
    </Animated.View>
  )
}
