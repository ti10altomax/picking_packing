import {
  createContext, useContext, useState, useRef, useEffect, useCallback,
  type ReactNode,
} from 'react'
import {
  View, Text, Pressable, Modal, BackHandler,
} from 'react-native'

// -----------------------------------------------------------------------------
// Tipos — mesma API do Dialog web
// -----------------------------------------------------------------------------

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'question'

type DialogConfig = {
  title?: string
  message?: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: Variant
  showCancel?: boolean
}

type Internal = DialogConfig & {
  id: number
  resolve: (v: boolean) => void
}

type DialogApi = {
  confirm: (cfg: DialogConfig) => Promise<boolean>
  alert: (cfg: Omit<DialogConfig, 'showCancel'>) => Promise<void>
}

const Ctx = createContext<DialogApi | null>(null)

// -----------------------------------------------------------------------------
// Provider — pilha de dialogs
// -----------------------------------------------------------------------------

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Internal[]>([])
  const idRef = useRef(0)

  const abrir = useCallback(
    (cfg: DialogConfig, defaultShowCancel: boolean) =>
      new Promise<boolean>((resolve) => {
        const id = ++idRef.current
        setStack((s) => [
          ...s,
          { ...cfg, showCancel: cfg.showCancel ?? defaultShowCancel, id, resolve },
        ])
      }),
    [],
  )

  const fechar = useCallback((id: number, valor: boolean) => {
    setStack((s) => {
      const alvo = s.find((x) => x.id === id)
      if (alvo) alvo.resolve(valor)
      return s.filter((x) => x.id !== id)
    })
  }, [])

  const api: DialogApi = {
    confirm: (cfg) => abrir(cfg, true),
    alert: (cfg) => abrir(cfg, false).then(() => undefined),
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      {stack.map((d) => (
        <DialogUI key={d.id} cfg={d} fechar={fechar} />
      ))}
    </Ctx.Provider>
  )
}

export function useDialog() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDialog precisa estar dentro de <DialogProvider />')
  return ctx
}

// -----------------------------------------------------------------------------
// UI de cada dialog
// -----------------------------------------------------------------------------

function DialogUI({
  cfg,
  fechar,
}: {
  cfg: Internal
  fechar: (id: number, v: boolean) => void
}) {
  const fechandoRef = useRef(false)

  const cancelar = useCallback(() => {
    if (fechandoRef.current) return
    fechandoRef.current = true
    fechar(cfg.id, false)
  }, [cfg.id, fechar])

  const confirmar = useCallback(() => {
    if (fechandoRef.current) return
    fechandoRef.current = true
    fechar(cfg.id, true)
  }, [cfg.id, fechar])

  // Botão voltar do Android: cancela se houver "Cancelar", senão confirma (igual ao backdrop)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cfg.showCancel) cancelar()
      else confirmar()
      return true
    })
    return () => sub.remove()
  }, [cfg.showCancel, cancelar, confirmar])

  const variant = cfg.variant ?? 'question'
  const cor = corPorVariante(variant)

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={cfg.showCancel ? cancelar : confirmar}
      statusBarTranslucent
    >
      <Pressable
        onPress={cfg.showCancel ? cancelar : confirmar}
        className="flex-1 bg-black/70 items-center justify-center px-4"
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-surface-card rounded-2xl border border-surface-border p-6"
        >
          <View className={`w-14 h-14 mx-auto mb-4 rounded-full items-center justify-center ${cor.bg}`}>
            <Icone variant={variant} cor={cor.icon} />
          </View>

          {cfg.title ? (
            <Text className="text-lg font-bold text-center text-ink mb-1">
              {cfg.title}
            </Text>
          ) : null}

          {cfg.message ? (
            <View className="mb-6">
              {typeof cfg.message === 'string' ? (
                <Text className="text-sm text-ink-muted text-center">
                  {cfg.message}
                </Text>
              ) : (
                cfg.message
              )}
            </View>
          ) : (
            <View className="mb-6" />
          )}

          <View className="flex-row gap-2">
            {cfg.showCancel ? (
              <Pressable
                onPress={cancelar}
                className="flex-1 h-11 bg-surface-elev rounded-xl items-center justify-center active:opacity-80"
              >
                <Text className="text-ink font-medium">
                  {cfg.cancelText ?? 'Cancelar'}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmar}
              className={`flex-1 h-11 rounded-xl items-center justify-center active:opacity-80 ${cor.button}`}
            >
              <Text className="text-white font-bold">
                {cfg.confirmText ?? 'OK'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// -----------------------------------------------------------------------------
// Cores por variante (paleta zinc, mesma do web)
// -----------------------------------------------------------------------------

function corPorVariante(v: Variant) {
  switch (v) {
    case 'success':
      return {
        bg: 'bg-emerald-500/15',
        icon: '#34d399', // emerald-400
        button: 'bg-emerald-500',
      }
    case 'danger':
      return {
        bg: 'bg-red-500/15',
        icon: '#f87171', // red-400
        button: 'bg-red-500',
      }
    case 'warning':
      return {
        bg: 'bg-amber-500/15',
        icon: '#fbbf24', // amber-400
        button: 'bg-amber-500',
      }
    case 'info':
      return {
        bg: 'bg-blue-500/15',
        icon: '#60a5fa', // blue-400
        button: 'bg-blue-500',
      }
    default:
      return {
        bg: 'bg-zinc-800',
        icon: '#fafafa',
        button: 'bg-zinc-100',
      }
  }
}

// -----------------------------------------------------------------------------
// Ícones em texto (sem dependência de SVG)
// -----------------------------------------------------------------------------

function Icone({ variant, cor }: { variant: Variant; cor: string }) {
  const simbolo =
    variant === 'success' ? '✓' :
    variant === 'danger' ? '!' :
    variant === 'warning' ? '⚠' :
    variant === 'info' ? 'i' :
    '?'

  return (
    <Text
      style={{ color: cor, fontSize: 30, fontWeight: '900', lineHeight: 32 }}
    >
      {simbolo}
    </Text>
  )
}
