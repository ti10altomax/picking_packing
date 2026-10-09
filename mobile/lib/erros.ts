import axios from 'axios'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { API_URL } from './api'

/**
 * Relato de erros do coletor para o backend (observabilidade, 2026-10-08).
 *
 * `POST /api/erros-cliente/` com origem 'mobile', versão do APK e o modelo
 * do aparelho — aparece em Admin → Saúde. Antes, um app travado na mão do
 * conferente só era descoberto se ele contasse. Axios cru (sem o interceptor
 * de 401) e dedup de 1 min por mensagem, igual ao web.
 */

type Relato = {
  mensagem: string
  stack?: string | null
  tela?: string
  extra?: Record<string, unknown>
}

const recentes = new Map<string, number>()
const JANELA_DEDUP_MS = 60_000

export const VERSAO_APP = Constants.expoConfig?.version ?? '?'
const DISPOSITIVO = `${Platform.OS} ${Platform.Version} · ${Constants.deviceName ?? 'aparelho'}`.slice(0, 200)

export async function reportarErro(r: Relato): Promise<void> {
  try {
    const mensagem = (r.mensagem || '(sem mensagem)').slice(0, 500)
    const chave = mensagem.slice(0, 200)
    const agora = Date.now()
    const ultimo = recentes.get(chave)
    if (ultimo && agora - ultimo < JANELA_DEDUP_MS) return
    recentes.set(chave, agora)

    let token: string | null = null
    try { token = await SecureStore.getItemAsync('access_token') } catch { /* sem keystore */ }

    await axios.post(
      `${API_URL}/api/erros-cliente/`,
      {
        origem: 'mobile',
        mensagem,
        stack: (r.stack || '').slice(0, 8000),
        tela: r.tela ?? '',
        versao: VERSAO_APP,
        dispositivo: DISPOSITIVO,
        extra: r.extra,
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 5000 },
    )
  } catch {
    // sem rede ou backend fora: não há para quem contar
  }
}

export function relatoDe(erro: unknown, extra?: Record<string, unknown>): Relato {
  if (axios.isAxiosError(erro)) {
    const status = erro.response?.status
    const url = erro.config?.url
    return {
      mensagem: `${erro.config?.method?.toUpperCase() ?? ''} ${url ?? ''} → ${status ?? erro.code ?? 'sem resposta'}: ${erro.message}`,
      stack: erro.stack,
      extra: { ...extra, status, url, resposta: erro.response?.data },
    }
  }
  if (erro instanceof Error) {
    return { mensagem: `${erro.name}: ${erro.message}`, stack: erro.stack, extra }
  }
  return { mensagem: String(erro), extra }
}

type HandlerGlobal = (erro: Error, fatal?: boolean) => void
type ErrorUtilsRN = { getGlobalHandler: () => HandlerGlobal; setGlobalHandler: (h: HandlerGlobal) => void }

let instalado = false

/**
 * Captura o que escapa do React no RN: exceção em handler, promessa sem catch
 * que vira erro fatal (Hermes). Relata e devolve ao handler original — em
 * produção o app ainda reinicia como antes, mas agora a TI fica sabendo.
 */
export function instalarRelatorGlobal(): void {
  if (instalado) return
  instalado = true
  const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsRN }).ErrorUtils
  if (!utils) return
  const anterior = utils.getGlobalHandler()
  utils.setGlobalHandler((erro, fatal) => {
    reportarErro(relatoDe(erro, { tipo: fatal ? 'fatal' : 'global' }))
    anterior?.(erro, fatal)
  })
}
