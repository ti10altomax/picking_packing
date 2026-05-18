import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

export type Perfil =
  | 'separador'
  | 'supervisor_vendas'
  | 'supervisor_patio'
  | 'admin'
  | 'etiquetador' // congelado

export interface User {
  id: number
  username: string
  perfil: Perfil
}

interface AuthStore {
  token: string | null
  user: User | null
  hydrated: boolean
  hydrate: () => Promise<void>
  setAuth: (access: string, refresh: string, user: User) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token')
      const raw = await SecureStore.getItemAsync('user')
      const user = raw ? (JSON.parse(raw) as User) : null
      set({ token, user, hydrated: true })
    } catch {
      set({ token: null, user: null, hydrated: true })
    }
  },

  setAuth: async (access, refresh, user) => {
    await SecureStore.setItemAsync('access_token', access)
    await SecureStore.setItemAsync('refresh_token', refresh)
    await SecureStore.setItemAsync('user', JSON.stringify(user))
    set({ token: access, user })
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token')
    await SecureStore.deleteItemAsync('refresh_token')
    await SecureStore.deleteItemAsync('user')
    set({ token: null, user: null })
  },
}))
