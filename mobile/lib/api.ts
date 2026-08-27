import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

// URL do backend — vem do .env via EXPO_PUBLIC_API_URL
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Anexa token JWT em toda request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Refresh automático em 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = await SecureStore.getItemAsync('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/api/auth/token/refresh/`, { refresh })
          await SecureStore.setItemAsync('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          await SecureStore.deleteItemAsync('access_token')
          await SecureStore.deleteItemAsync('refresh_token')
          await SecureStore.deleteItemAsync('user')
        }
      }
    }
    return Promise.reject(error)
  },
)

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const authApi = {
  login: (username: string, password: string) =>
    axios.post(`${API_URL}/api/auth/token/`, { username, password }).then((r) => r.data),
}

export const conferenciaApi = {
  listarAtribuidos: () => api.get('/api/conferencia/pedidos/').then((r) => r.data),
  detalhe: (id: number) => api.get(`/api/conferencia/pedidos/${id}/`).then((r) => r.data),
  iniciar: (id: number) => api.post(`/api/conferencia/pedidos/${id}/iniciar/`).then((r) => r.data),
  criarVolume: (id: number, tipo: 'caixa' | 'fardo' | 'outro', identificador?: string) =>
    api.post(`/api/conferencia/pedidos/${id}/volumes/`, { tipo, identificador }).then((r) => r.data),
  bipar: (id: number, body: { item_id: number; qtd: number; codigo: string; volume_id: number }) =>
    api.post(`/api/conferencia/pedidos/${id}/bipar/`, body).then((r) => r.data),
  concluir: (id: number) => api.post(`/api/conferencia/pedidos/${id}/concluir/`).then((r) => r.data),
  marcarNaoConforme: (id: number, motivo: string, detalhe?: string) =>
    api.post(`/api/conferencia/pedidos/${id}/nao_conforme/`, { motivo, detalhe }).then((r) => r.data),
  removerVolumeItem: (pedidoId: number, volumeId: number, volumeItemId: number) =>
    api.delete(`/api/conferencia/pedidos/${pedidoId}/volumes/${volumeId}/itens/${volumeItemId}/`)
      .then((r) => r.data),
  removerVolume: (pedidoId: number, volumeId: number) =>
    api.delete(`/api/conferencia/pedidos/${pedidoId}/volumes/${volumeId}/`).then((r) => r.data),
}

export const pedidosApi = {
  buscar: (id: number) => api.get(`/api/pedidos/${id}/`).then((r) => r.data),
}

export const supervisorApi = {
  listarPendentes: (params: { search?: string; page?: number } = {}) =>
    api.get('/api/pedidos/', { params: { status: 'pendente', ...params } }).then((r) => r.data),
  selecionar: (pedidoIds: number[]) =>
    api.post('/api/pedidos/selecionar/', { pedido_ids: pedidoIds }).then((r) => r.data),
  listarSelecionados: (params: { search?: string; page?: number } = {}) =>
    api.get('/api/pedidos/', { params: { status: 'selecionado', ...params } }).then((r) => r.data),
  listarConferentes: () =>
    api.get('/api/users/conferentes/').then((r) => r.data),
  atribuir: (pedidoIds: number[], conferenteId: number) =>
    api.post('/api/pedidos/atribuir/', { pedido_ids: pedidoIds, conferente_id: conferenteId }).then((r) => r.data),
  listarConferidos: (params: { search?: string; page?: number } = {}) =>
    api.get('/api/pedidos/', { params: { status: 'conferido', ...params } }).then((r) => r.data),
  listarNaoConformes: () =>
    api.get('/api/nao-conformes/').then((r) => r.data),
  cancelarNaoConforme: (id: number) =>
    api.post(`/api/nao-conformes/${id}/cancelar/`).then((r) => r.data),
  retornarNaoConforme: (id: number) =>
    api.post(`/api/nao-conformes/${id}/retornar/`).then((r) => r.data),
}
