import type { AjudaTela, PerfilAjuda } from './tipos'
import { visaoGeral } from './visao-geral'
import { login } from './login'
import { conferencia } from './conferencia'
import { conferenciaPedido } from './conferencia-pedido'
import { supervisorVendas } from './supervisor-vendas'
import { supervisorPatio } from './supervisor-patio'
import { supervisorSequencia } from './supervisor-sequencia'
import { supervisorSequenciaRelatorio } from './supervisor-sequencia-relatorio'
import { supervisorSeparadores } from './supervisor-separadores'
import { supervisorAgora } from './supervisor-agora'
import { supervisorNaoConformes } from './supervisor-nao-conformes'
import { supervisorCancelados } from './supervisor-cancelados'
import { supervisorDivergencias } from './supervisor-divergencias'
import { supervisorFechamentos } from './supervisor-fechamentos'
import { supervisorEtiquetas } from './supervisor-etiquetas'
import { supervisorCartas } from './supervisor-cartas'
import { supervisorErros } from './supervisor-erros'
import { supervisorConferidos } from './supervisor-conferidos'
import { admin } from './admin'
import { adminSaude } from './admin-saude'
import { adminApp } from './admin-app'
import { adminImpressoras } from './admin-impressoras'
import { adminAgents } from './admin-agents'
import { etiquetaNavegador } from './etiqueta-navegador'

/**
 * Registro das telas com ajuda (manual embutido, 2026-10-29).
 * Ordem = ordem do manual em /ajuda. Tela nova → arquivo novo aqui;
 * `npm run ajuda:checar` lista as rotas de app/ que ficaram sem ajuda.
 */
export const TELAS: AjudaTela[] = [
  visaoGeral,
  login,
  conferencia,
  conferenciaPedido,
  supervisorVendas,
  supervisorPatio,
  supervisorSequencia,
  supervisorSequenciaRelatorio,
  supervisorSeparadores,
  supervisorAgora,
  supervisorNaoConformes,
  supervisorCancelados,
  supervisorDivergencias,
  supervisorFechamentos,
  supervisorEtiquetas,
  supervisorCartas,
  supervisorErros,
  supervisorConferidos,
  admin,
  adminSaude,
  adminApp,
  adminImpressoras,
  adminAgents,
  etiquetaNavegador,
]

/** /supervisor/patio/[id] → ^/supervisor/patio/[^/]+/?$ — segmento [x] vira curinga, o resto é literal */
function regexDaRota(rota: string): RegExp {
  const partes = rota.split('/').map((seg) => {
    if (seg.startsWith('[') && seg.endsWith(']')) return '[^/]+'
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  })
  return new RegExp(`^${partes.join('/')}/?$`)
}

const INDICE = TELAS.map((t) => ({ tela: t, re: regexDaRota(t.rota) }))

export function ajudaPorRota(pathname: string | null | undefined): AjudaTela | null {
  if (!pathname) return null
  const hit = INDICE.find((i) => i.re.test(pathname))
  return hit ? hit.tela : null
}

export function ajudaPorChave(chave: string): AjudaTela | null {
  return TELAS.find((t) => t.chave === chave) ?? null
}

export function telasDoPerfil(perfil: PerfilAjuda): AjudaTela[] {
  return TELAS.filter((t) => t.perfis.includes(perfil))
}
