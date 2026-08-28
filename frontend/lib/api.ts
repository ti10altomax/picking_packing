import axios from 'axios'

// URLs relativas — o Next.js faz o proxy /api/* para o backend internamente.
// Funciona em HTTP e HTTPS sem mixed content.
export const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/token/refresh/', { refresh })
          localStorage.setItem('access_token', data.access)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      } else {
        if (typeof window !== 'undefined') window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const pedidosApi = {
  listar: (params?: Record<string, string>) =>
    api.get('/api/pedidos/', { params }).then((r) => r.data),
  buscar: (id: number) =>
    api.get(`/api/pedidos/${id}/`).then((r) => r.data),
  biparItem: (id: number, codigo: string, manual = false) =>
    api.post(`/api/pedidos/${id}/bipar_item/`, { codigo, manual }).then((r) => r.data),
  cancelarItem: (pedidoId: number, itemId: number) =>
    api.post(`/api/pedidos/${pedidoId}/cancelar_item/`, { item_id: itemId }).then((r) => r.data),
  marcarFalta: (pedidoId: number, itemId: number) =>
    api.post(`/api/pedidos/${pedidoId}/marcar_falta/`, { item_id: itemId }).then((r) => r.data),
  atribuirEndereco: (id: number, endereco: string) =>
    api.post(`/api/pedidos/${id}/atribuir_endereco/`, { endereco }).then((r) => r.data),
  // LEGADO (escopo antigo) — endpoint congelado mantém o nome antigo
  finalizarSeparacao: (id: number, endereco: string) =>
    api.post(`/api/pedidos/${id}/finalizar_separacao/`, { endereco }).then((r) => r.data),
}

export const etiquetasApi = {
  listarImpressoras: () =>
    api.get('/api/etiquetas/impressoras/').then((r) => r.data),
  criarLote: (impressoraId: number) =>
    api.post('/api/etiquetas/lotes/criar/', { impressora_id: impressoraId }).then((r) => r.data),
  getLote: (id: number) =>
    api.get(`/api/etiquetas/lotes/${id}/`).then((r) => r.data),
  confirmarPedido: (loteId: number, codigo: string) =>
    api.post(`/api/etiquetas/lotes/${loteId}/confirmar/`, { codigo }).then((r) => r.data),
  finalizarLote: (loteId: number) =>
    api.post(`/api/etiquetas/lotes/${loteId}/finalizar/`).then((r) => r.data),
  loteAtivo: () =>
    api.get('/api/etiquetas/lotes/ativo/').then((r) => r.data),
}

export const conferenciaApi = {
  listarAtribuidos: () =>
    api.get('/api/conferencia/pedidos/').then((r) => r.data),
  detalhe: (id: number) =>
    api.get(`/api/conferencia/pedidos/${id}/`).then((r) => r.data),
  iniciar: (id: number, apontamento: { separado_por?: number; nao_identificado?: boolean }) =>
    api.post(`/api/conferencia/pedidos/${id}/iniciar/`, apontamento).then((r) => r.data),
  alterarSeparadoPor: (id: number, apontamento: { separado_por?: number; nao_identificado?: boolean }) =>
    api.post(`/api/conferencia/pedidos/${id}/separado_por/`, apontamento).then((r) => r.data),
  criarVolume: (id: number, tipo: 'caixa' | 'fardo' | 'outro', identificador?: string) =>
    api.post(`/api/conferencia/pedidos/${id}/volumes/`, { tipo, identificador }).then((r) => r.data),
  bipar: (id: number, body: { item_id: number; qtd: number; codigo: string; volume_id: number }) =>
    api.post(`/api/conferencia/pedidos/${id}/bipar/`, body).then((r) => r.data),
  concluir: (id: number, sobras: { item_id: number; qtd: number }[] = []) =>
    api.post(`/api/conferencia/pedidos/${id}/concluir/`, { sobras }).then((r) => r.data),
  marcarNaoConforme: (id: number, motivo: string, detalhe?: string) =>
    api.post(`/api/conferencia/pedidos/${id}/nao_conforme/`, { motivo, detalhe }).then((r) => r.data),
  removerVolumeItem: (pedidoId: number, volumeId: number, volumeItemId: number) =>
    api.delete(`/api/conferencia/pedidos/${pedidoId}/volumes/${volumeId}/itens/${volumeItemId}/`)
      .then((r) => r.data),
  removerVolume: (pedidoId: number, volumeId: number) =>
    api.delete(`/api/conferencia/pedidos/${pedidoId}/volumes/${volumeId}/`).then((r) => r.data),
}

export type Divergencia = {
  id: number
  criado_em: string
  codigo_bipado: string
  qtd: number
  observacao: string
  vinculado_por: string | null
  sku: string
  descricao: string
  ean: string
  pedido_id: number
  numero_externo: string
}

export type Fechamento = {
  id: number
  numero_externo: string
  cliente: string
  conferente: string | null
  separado_por: string | null
  separador_nao_identificado: boolean
  sequencia_numero: number | null
  sobras: { sku: string | null; descricao: string | null; qtd: number }[]
}

export const divergenciasApi = {
  listar: () =>
    api.get('/api/divergencias/').then((r) => r.data as Divergencia[]),
  liberar: (pedidoId: number, dados: { item_id: number; codigo: string; qtd: number; observacao?: string }) =>
    api.post(`/api/conferencia/pedidos/${pedidoId}/liberar_divergencia/`, dados).then((r) => r.data),
}

export type ErroSeparacaoResumo = {
  separador_id: number | null
  nome: string
  nao_identificado: boolean
  sobras: number
  faltas: number
  total: number
  ocorrencias: number
}

export type ErroSeparacaoItem = {
  id: number
  criado_em: string
  tipo: 'a_mais' | 'a_menos'
  qtd: number
  sku: string | null
  descricao: string | null
  pedido_id: number
  numero_externo: string
  separador: string | null
  registrado_por: string | null
}

export const errosApi = {
  listar: (params: { tipo?: string; separador?: string; data_inicio?: string; data_fim?: string } = {}) =>
    api.get('/api/erros-separacao/', { params })
      .then((r) => r.data as { resumo: ErroSeparacaoResumo[]; erros: ErroSeparacaoItem[] }),
}

export const fechamentosApi = {
  listar: () =>
    api.get('/api/fechamentos/').then((r) => r.data as Fechamento[]),
  fechar: (pedidoId: number) =>
    api.post(`/api/fechamentos/${pedidoId}/fechar/`).then((r) => r.data),
}

export type RelatorioSequencia = {
  sequencia: { id: number; numero: number; status: string; criado_em: string; concluida_em: string | null }
  linhas: { sku: string; descricao: string; caixa: number; fardo: number; outro: number; total: number }[]
  totais: { caixa: number; fardo: number; outro: number; total: number }
  volumes: Record<string, number>
}

export type SequenciaResumo = {
  id: number
  numero: number
  status: 'aberta' | 'em_andamento' | 'concluida'
  criado_em: string
  concluida_em: string | null
  qtd_pedidos: number
  qtd_sem_conferente: number
  qtd_pendentes: number
  qtd_finalizados: number
}

export type SequenciaPedido = {
  id: number
  numero_externo: string
  cliente: string
  status: string
  conferente: number | null
  conferente_username: string | null
  atribuido_em: string | null
  qtd_itens: number
}

export const sequenciasApi = {
  listar: (status?: string) =>
    api.get('/api/sequencias/', { params: status ? { status } : {} })
      .then((r) => r.data as SequenciaResumo[]),
  criar: (pedidoIds: number[]) =>
    api.post('/api/sequencias/', { pedido_ids: pedidoIds })
      .then((r) => r.data as SequenciaResumo & { adicionados: number[]; ignorados: number[] }),
  detalhe: (id: number) =>
    api.get(`/api/sequencias/${id}/`)
      .then((r) => r.data as SequenciaResumo & { pedidos: SequenciaPedido[] }),
  adicionar: (id: number, pedidoIds: number[]) =>
    api.post(`/api/sequencias/${id}/adicionar/`, { pedido_ids: pedidoIds }).then((r) => r.data),
  remover: (id: number, pedidoIds: number[]) =>
    api.post(`/api/sequencias/${id}/remover/`, { pedido_ids: pedidoIds }).then((r) => r.data),
  atribuir: (id: number, pedidoIds: number[], conferenteId: number) =>
    api.post(`/api/sequencias/${id}/atribuir/`, {
      pedido_ids: pedidoIds,
      conferente_id: conferenteId,
    }).then((r) => r.data),
  excluir: (id: number) =>
    api.delete(`/api/sequencias/${id}/`).then((r) => r.data),
  relatorio: (id: number) =>
    api.get(`/api/sequencias/${id}/relatorio/`).then((r) => r.data as RelatorioSequencia),
}

export type SeparadorCadastro = {
  id: number
  nome: string
  apelido: string
  documento: string
  tipo: 'extra' | 'funcionario'
  ativo: boolean
  criado_em: string
  liberado_hoje?: boolean
}

export type SeparadorLiberado = { id: number; nome: string; apelido: string }

export const separadoresApi = {
  listar: (params: { search?: string; ativos?: '1' } = {}) =>
    api.get('/api/separadores/', { params }).then((r) => r.data as SeparadorCadastro[]),
  criar: (dados: { nome: string; apelido?: string; documento?: string; tipo?: string }) =>
    api.post('/api/separadores/', dados).then((r) => r.data as SeparadorCadastro),
  atualizar: (id: number, dados: Partial<Pick<SeparadorCadastro, 'nome' | 'apelido' | 'documento' | 'tipo' | 'ativo'>>) =>
    api.patch(`/api/separadores/${id}/`, dados).then((r) => r.data as SeparadorCadastro),
  liberar: (separadorIds: number[], data?: string) =>
    api.post('/api/separadores/liberar/', { separador_ids: separadorIds, data }).then((r) => r.data),
  desliberar: (separadorIds: number[], data?: string) =>
    api.post('/api/separadores/desliberar/', { separador_ids: separadorIds, data }).then((r) => r.data),
  liberados: (data?: string) =>
    api.get('/api/separadores/liberados/', { params: data ? { data } : {} })
      .then((r) => r.data as SeparadorLiberado[]),
}

export type Paginado<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export const supervisorApi = {
  listarPendentes: (params: { search?: string; page?: number } = {}) =>
    api.get('/api/pedidos/', {
      params: { status: 'pendente', ...params },
    }).then((r) => r.data),
  selecionar: (pedidoIds: number[]) =>
    api.post('/api/pedidos/selecionar/', { pedido_ids: pedidoIds }).then((r) => r.data),
  listarSelecionados: (params: { search?: string; page?: number; sem_sequencia?: '1' } = {}) =>
    api.get('/api/pedidos/', {
      params: { status: 'selecionado', ...params },
    }).then((r) => r.data),
  listarConferentes: () =>
    api.get('/api/users/conferentes/').then((r) => r.data),
  listarNaoConformes: () =>
    api.get('/api/nao-conformes/').then((r) => r.data),
  cancelarNaoConforme: (id: number) =>
    api.post(`/api/nao-conformes/${id}/cancelar/`).then((r) => r.data),
  retornarNaoConforme: (id: number) =>
    api.post(`/api/nao-conformes/${id}/retornar/`).then((r) => r.data),
  listarConferidos: (params: { search?: string; page?: number } = {}) =>
    api.get('/api/pedidos/', {
      params: { status: 'conferido', ...params },
    }).then((r) => r.data),
}

export const adminApi = {
  listarImpressoras: () =>
    api.get('/api/etiquetas/admin/impressoras/').then((r) => r.data),
  criarImpressora: (dados: Record<string, unknown>) =>
    api.post('/api/etiquetas/admin/impressoras/', dados).then((r) => r.data),
  getImpressora: (id: number) =>
    api.get(`/api/etiquetas/admin/impressoras/${id}/`).then((r) => r.data),
  editarImpressora: (id: number, dados: Record<string, unknown>) =>
    api.patch(`/api/etiquetas/admin/impressoras/${id}/`, dados).then((r) => r.data),
  desativarImpressora: (id: number) =>
    api.delete(`/api/etiquetas/admin/impressoras/${id}/`),
  testarImpressora: (id: number) =>
    api.post(`/api/etiquetas/admin/impressoras/${id}/testar/`).then((r) => r.data),
  listarAgents: () =>
    api.get('/api/etiquetas/admin/agents/').then((r) => r.data),
}

export const authApi = {
  login: (username: string, password: string) =>
    axios.post('/api/auth/token/', { username, password }).then((r) => r.data),
}
