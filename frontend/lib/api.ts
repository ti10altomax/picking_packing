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
  // Ponto 4 (leitura B): bipa a nota (chave do DANFE ou número) e pega/abre o pedido
  pegarDocumento: (body: { codigo?: string; pedido_id?: number }) =>
    api.post('/api/conferencia/pegar/', body).then((r) => r.data),
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
  tipo?: string
  numero_externo: string
}

export type Fechamento = {
  id: number
  tipo?: string
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
  tipo_doc?: string
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

export type RelatorioDocumento = {
  id: number
  tipo: string
  numero_externo: string
  frete: string
  frete_label: string
  transportadora?: string
  cliente: string
  status: string
  status_label: string
  conferente: string | null
  separado_por: string | null
  separador_nao_identificado: boolean
  volumes: { caixa: number; fardo: number; outro: number; total: number }
  unid_pedidas: number
  unid_conferidas: number
  conferido_em: string | null
  transferido_para: string | null
}

export type RelatorioSequencia = {
  sequencia: { id: number; numero: number; status: string; criado_em: string; concluida_em: string | null }
  documentos: RelatorioDocumento[]
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
  tipo?: string
  frete?: string
  transportadora?: string
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
  listarPendentes: (params: { search?: string; page?: number; tipo?: string; frete?: string } = {}) =>
    api.get('/api/pedidos/', {
      params: { status: 'pendente', ...params },
    }).then((r) => r.data),
  selecionar: (pedidoIds: number[]) =>
    api.post('/api/pedidos/selecionar/', { pedido_ids: pedidoIds }).then((r) => r.data),
  listarSelecionados: (params: { search?: string; page?: number; sem_sequencia?: '1'; ordem?: 'transportadora' } = {}) =>
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
  // Cancelados no Senior (ou pelo supervisor) com conferência a transferir
  listarCancelados: () =>
    api.get('/api/cancelados/').then((r) => r.data),
  buscarDestinosTransferencia: (id: number, q: string) =>
    api.get(`/api/cancelados/${id}/destinos/`, { params: { q } }).then((r) => r.data),
  transferirConferencia: (id: number, destinoId: number) =>
    api.post(`/api/cancelados/${id}/transferir/`, { destino_id: destinoId }).then((r) => r.data),
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

// ---------------------------------------------------------------------------
// Etiquetas de volume (ponto 7 da diretoria, 2026-10-07)
// ---------------------------------------------------------------------------

export type EtiquetaItem = { sku: string; descricao: string; ean: string; qtd: number }

export type EtiquetaVolume = {
  volume: { id: number; numero: number; tipo: string; tipo_label: string; identificador: string }
  pagina: number
  total_paginas: number
  itens: EtiquetaItem[]
  qtd_unidades: number
  qtd_itens: number
}

export type ImpressaoEtiqueta = {
  id: number
  criado_em: string
  canal: 'rede' | 'agente' | 'navegador'
  canal_label: string
  status: 'ok' | 'erro'
  impressora: string | null
  impressora_id: number | null
  qtd_etiquetas: number
  automatica: boolean
  usuario: string | null
  erro: string
}

export type EtiquetasPedido = {
  pedido: {
    id: number; tipo: string; tipo_label: string; numero_externo: string; codfil: string; codsnf: string
    cliente: string; transportadora: string; codtra: string; frete: string; frete_label: string
    conferido_em: string | null; conferente: string | null; sequencia_numero: number | null
  }
  total_volumes: number
  etiquetas: EtiquetaVolume[]
  rodape: { titulo: string; responsabilidades: string[]; empresa: string[] }
  gerado_em: string
  bloqueio: { codigo: string; mensagem: string } | null
  impressoes: ImpressaoEtiqueta[]
}

export type ImpressoraEtiqueta = {
  id: number
  nome: string
  modelo: string
  tipo_conexao: 'rede' | 'usb'
  mesa: string
  ip: string | null
  porta: number
  ultimo_heartbeat: string | null
  padrao: boolean
}

export type EtiquetaPendente = {
  id: number
  tipo: string
  numero_externo: string
  frete: string
  cliente: string
  transportadora: string
  conferido_em: string | null
  conferente: string | null
  sequencia_numero: number | null
  qtd_volumes: number
  pronta: boolean
  ultimo_erro: string | null
}

/** Veredito da impressão automática devolvido pelo concluir / fechar sobra */
export type VereditoEtiqueta = {
  resultado: 'enfileirada' | 'sem_transportadora' | 'sem_impressora_padrao' | 'desligada' | 'erro'
    | 'nao_conferido' | 'pedido_cancelado' | 'sem_volumes'
  impressora: string | null
  impressora_id?: number
  mensagem?: string
  qtd_volumes: number
}

export const impressaoApi = {
  etiquetas: (pedidoId: number) =>
    api.get(`/api/impressao/pedidos/${pedidoId}/etiquetas/`).then((r) => r.data as EtiquetasPedido),
  zplUrl: (pedidoId: number) => `/api/impressao/pedidos/${pedidoId}/etiquetas/zpl/`,
  imprimir: (pedidoId: number, body: { impressora_id?: number; canal?: 'navegador' }) =>
    api.post(`/api/impressao/pedidos/${pedidoId}/imprimir/`, body)
      .then((r) => r.data as { resultado: string; erro: string | null; impressao: ImpressaoEtiqueta }),
  pendentes: () =>
    api.get('/api/impressao/pendentes/')
      .then((r) => r.data as { prontas: EtiquetaPendente[]; aguardando_transportadora: EtiquetaPendente[] }),
  impressoras: () =>
    api.get('/api/impressao/impressoras/')
      .then((r) => r.data as { impressoras: ImpressoraEtiqueta[]; impressora_padrao: number | null; automatica: boolean }),
  config: () =>
    api.get('/api/impressao/config/')
      .then((r) => r.data as { impressora_padrao: number | null; impressora_padrao_nome: string | null; automatica: boolean }),
  salvarConfig: (dados: { impressora_padrao?: number | null; automatica?: boolean }) =>
    api.put('/api/impressao/config/', dados)
      .then((r) => r.data as { impressora_padrao: number | null; impressora_padrao_nome: string | null; automatica: boolean }),
}

// ---------------------------------------------------------------------------
// Saúde do sistema (observabilidade, 2026-10-08) — Admin → Saúde
// ---------------------------------------------------------------------------
export type StatusSaude = 'ok' | 'atencao' | 'erro'

export type ComponenteSaude = {
  chave: string
  nome: string
  status: StatusSaude
  detalhe: string
  latencia_ms: number
  essencial: boolean
}

export type TarefaSaude = {
  tarefa: string
  nome: string
  periodica: boolean
  intervalo_s: number | null
  atrasada: boolean
  ultima_em: string | null
  ultimo_status: 'rodando' | 'ok' | 'erro' | null
  duracao_ms: number | null
  erro: string
  resultado: unknown
  ultima_ok_em: string | null
  idade_ok_s: number | null
  execucoes_24h: number
  erros_24h: number
}

export type SaudeSistema = {
  status: StatusSaude
  gerado_em: string
  problemas: string[]
  componentes: ComponenteSaude[]
  tarefas: TarefaSaude[]
  retencao_dias: number
}

export const saudeApi = {
  completa: () => api.get('/api/saude/').then((r) => r.data as SaudeSistema),
}

export type ErroClienteItem = {
  id: number
  origem: 'web' | 'mobile'
  tela: string
  mensagem: string
  stack: string
  versao: string
  dispositivo: string
  usuario: string | null
  extra: Record<string, unknown> | null
  criado_em: string
}

export const errosClienteApi = {
  listar: (horas = 24, origem?: 'web' | 'mobile') =>
    api.get('/api/erros-cliente/lista/', { params: { horas, ...(origem ? { origem } : {}) } })
      .then((r) => r.data as { horas: number; total: number; erros: ErroClienteItem[] }),
}

// ---------------------------------------------------------------------------
// Histórico do pedido + painel "agora" (observabilidade, 2026-10-08)
// ---------------------------------------------------------------------------
export type EventoHistorico = {
  id: number
  criado_em: string
  usuario: string | null
  acao: string
  titulo: string
  descricao: string
  tipo: 'fluxo' | 'bip' | 'alerta' | 'etiqueta' | 'legado'
  payload: Record<string, unknown>
}

export type HistoricoPedido = {
  pedido: {
    id: number
    tipo: string
    numero_externo: string
    cliente: string
    status: string
    status_label: string
    conferente: string | null
    sequencia: number | null
    transportadora: string
  }
  eventos: EventoHistorico[]
}

export const historicoApi = {
  pedido: (id: number) => api.get(`/api/pedidos/${id}/historico/`).then((r) => r.data as HistoricoPedido),
}

export type AgoraConferente = {
  conferente: string
  em_conferencia: {
    id: number
    tipo: string
    numero_externo: string
    cliente: string
    sequencia: number | null
    separado_por: string | null
    iniciada_em: string | null
    ha_min: number | null
    ultimo_bip_em: string | null
    sem_bip_min: number | null
    qtd_pedida: number
    qtd_separada: number
  } | null
  atribuidos: number
  bips_1h: number
  conferidos_hoje: number
  parado: boolean
}

export type AgoraPainel = {
  gerado_em: string
  conferentes: AgoraConferente[]
  sem_iniciar: { id: number; tipo: string; numero_externo: string; conferente: string | null; sequencia: number | null; ha_min: number | null }[]
  filas: {
    selecionados_sem_sequencia: number
    selecionados_em_sequencia: number
    atribuidos: number
    atribuido_mais_antigo_min: number | null
    em_conferencia: number
    aguardando_fechamento: number
    nao_conformes: number
    cancelados_a_transferir: number
    etiquetas_prontas: number
    etiquetas_aguardando_transportadora: number
    conferidos_hoje: number
    conferidos_1h: number
    bips_1h: number
    bips_hoje: number
    divergencias_hoje: number
    cancelados_hoje: number
  }
  sequencias: {
    id: number; numero: number; status: string; total: number; selecionados: number; atribuidos: number
    em_conferencia: number; finalizados: number; outros: number; conferentes: string[]; criado_em: string
  }[]
  por_hora: { hora: string; bips: number; conferidos: number }[]
  parado_apos_min: number
  sem_iniciar_apos_min: number
}

export const agoraApi = {
  painel: () => api.get('/api/agora/').then((r) => r.data as AgoraPainel),
}
