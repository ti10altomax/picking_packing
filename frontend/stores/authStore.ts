import { create } from 'zustand'

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
  hydrate: () => void
  setAuth: (access: string, refresh: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  user: null,
  hydrate: () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('access_token')
    const raw = localStorage.getItem('user')
    set({ token, user: raw ? JSON.parse(raw) : null })
  },
  setAuth: (access, refresh, user) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    localStorage.setItem('user', JSON.stringify(user))
    set({ token: access, user })
  },
  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ token: null, user: null })
  },
}))
