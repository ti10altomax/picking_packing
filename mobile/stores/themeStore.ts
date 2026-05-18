import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { Appearance, type ColorSchemeName } from 'react-native'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeStore {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  hydrated: boolean
  hydrate: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
  toggle: () => Promise<void>
}

function resolver(modo: ThemeMode, sys: ColorSchemeName): 'light' | 'dark' {
  if (modo === 'system') return sys === 'dark' ? 'dark' : 'light'
  return modo
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  resolved: 'dark',
  hydrated: false,

  hydrate: async () => {
    const saved = ((await SecureStore.getItemAsync('theme')) as ThemeMode | null) ?? 'system'
    const sys = Appearance.getColorScheme()
    const resolved = resolver(saved, sys)
    set({ mode: saved, resolved, hydrated: true })

    Appearance.addChangeListener(({ colorScheme: cs }) => {
      if (get().mode !== 'system') return
      set({ resolved: resolver('system', cs) })
    })
  },

  setMode: async (modo) => {
    await SecureStore.setItemAsync('theme', modo)
    const sys = Appearance.getColorScheme()
    set({ mode: modo, resolved: resolver(modo, sys) })
  },

  toggle: async () => {
    const atual = get().resolved
    await get().setMode(atual === 'dark' ? 'light' : 'dark')
  },
}))
