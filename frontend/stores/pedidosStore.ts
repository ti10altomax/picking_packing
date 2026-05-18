import { create } from 'zustand'
import { pedidosApi } from '@/lib/api'

export interface Pedido {
  id: number
  numero_externo: string
  marketplace_nome: string | null
  cliente: string
  status: string
  criado_em: string
  separado_em: string | null
  faturado_em: string | null
  endereco_fisico: string
  percent_separado: number
  qtd_itens: number
  tempo_espera: string
}

interface PedidosStore {
  pedidos: Pedido[]
  filtroStatus: string
  loading: boolean
  lastSync: Date | null
  setFiltro: (status: string) => void
  fetchPedidos: () => Promise<void>
}

export const usePedidosStore = create<PedidosStore>((set, get) => ({
  pedidos: [],
  filtroStatus: '',
  loading: false,
  lastSync: null,
  setFiltro: (filtroStatus) => {
    set({ filtroStatus })
    get().fetchPedidos()
  },
  fetchPedidos: async () => {
    set({ loading: true })
    try {
      const { filtroStatus } = get()
      const data = await pedidosApi.listar(filtroStatus ? { status: filtroStatus } : undefined)
      set({ pedidos: data.results ?? data, lastSync: new Date() })
    } catch (e) {
      console.error('Erro ao buscar pedidos:', e)
    } finally {
      set({ loading: false })
    }
  },
}))
