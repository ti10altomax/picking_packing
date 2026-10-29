/**
 * Manual do usuário embutido (2026-10-29).
 *
 * Cada tela do sistema tem um arquivo em `content/ajuda/<chave>.ts` que exporta
 * um `AjudaTela`. O botão "?" do cabeçalho (`components/Ajuda.tsx`) mostra a
 * ajuda da rota atual; a página pública `/ajuda` junta todas num manual
 * navegável por perfil (o coletor abre essa página no navegador).
 *
 * Texto em pt-BR, voltado a quem opera: frases curtas, verbo no imperativo,
 * nomes de botões e badges exatamente como aparecem na tela.
 */

export type PerfilAjuda = 'conferente' | 'supervisor_vendas' | 'supervisor_patio' | 'admin'

export const PERFIL_LABEL: Record<PerfilAjuda, string> = {
  conferente: 'Conferente',
  supervisor_vendas: 'Supervisor de Vendas',
  supervisor_patio: 'Supervisor de Pátio',
  admin: 'Admin',
}

export type Captura = {
  /** caminho em /public, ex.: /manual/supervisor-patio.png */
  src: string
  legenda?: string
  /** captura feita no coletor (retrato) — a página renderiza mais estreita */
  mobile?: boolean
}

export type Elemento = {
  /** nome como está na tela: "Enviar para separação", badge "NF", cor azul… */
  nome: string
  descricao: string
}

export type Situacao = {
  /** o que o usuário vê: mensagem, bloqueio, badge, cor */
  quando: string
  oQueFazer: string
}

export type AjudaTela = {
  /** identificador estável, usado no #âncora de /ajuda e no "?" do coletor */
  chave: string
  titulo: string
  /** onde fica no menu, ex.: "Gestão → Etiquetas" (vazio quando é a tela inicial do perfil) */
  menu?: string
  /** rota do web com [id] para segmentos dinâmicos, ex.: /supervisor/patio/[id] */
  rota: string
  perfis: PerfilAjuda[]
  /** 1 a 3 frases: para que a tela serve e quando o usuário chega nela */
  resumo: string
  capturas?: Captura[]
  /** passo a passo da operação normal, na ordem */
  passos?: string[]
  /** botões, filtros, badges e cores — o que cada um significa */
  elementos?: Elemento[]
  /** mensagens, bloqueios e casos fora do normal */
  situacoes?: Situacao[]
  dicas?: string[]
  /** chaves de outras telas ligadas a esta */
  relacionadas?: string[]
}
