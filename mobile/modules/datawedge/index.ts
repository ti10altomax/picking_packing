import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

/**
 * Leitor contínuo do coletor Zebra (2026-11-10, pedido do usuário): o mesmo "deixa ligado"
 * da câmera, mas no leitor da frente do TC21, via DataWedge (módulo nativo em
 * `modules/datawedge/android`). Num celular comum, ou no Expo Go, `TEM_DATAWEDGE` é false e
 * o botão "Leitor" não aparece — o critério é o pacote do DataWedge existir no aparelho,
 * não a marca.
 *
 * Ligar = (1) descobrir o perfil ativo do DataWedge, (2) pôr nele Continuous Read + feixe
 * sem timeout + mesmo código só depois de `mesmoCodigoMs`, (3) esperar o scanner voltar de
 * pé depois da troca de configuração (o DataWedge recarrega o perfil e um START imediato é
 * engolido — visto no logcat do TC21) e mandar START_SCANNING, confirmando pelo status
 * SCANNING. A leitura continua chegando como teclado na barra de bipagem, igual ao gatilho.
 * Desligar = STOP_SCANNING + perfil de volta ao modo Trigger.
 */
type Nativo = {
  temDataWedge(): boolean
  perfilAtivo(): Promise<string | null>
  configurarLeituraContinua(perfil: string, mesmoCodigoMs: number): Promise<boolean>
  restaurarGatilho(perfil: string): Promise<boolean>
  iniciarLeitura(): boolean
  pararLeitura(): boolean
  iniciarLeituraQuandoPronto(): Promise<boolean>
}

const nativo = Platform.OS === 'android' ? requireOptionalNativeModule<Nativo>('DataWedge') : null

/** true só num aparelho com o DataWedge instalado (coletor Zebra) */
export const TEM_DATAWEDGE: boolean = (() => {
  try {
    return !!nativo?.temDataWedge()
  } catch {
    return false
  }
})()

let perfilEmUso: string | null = null

/** Liga o leitor em modo contínuo. Devolve false se o DataWedge não respondeu ou o feixe não acendeu. */
export async function ligarLeitorContinuo(mesmoCodigoMs: number): Promise<boolean> {
  if (!nativo) return false
  const perfil = await nativo.perfilAtivo()
  if (!perfil) return false
  const ok = await nativo.configurarLeituraContinua(perfil, mesmoCodigoMs)
  if (!ok) return false
  perfilEmUso = perfil
  const acendeu = await nativo.iniciarLeituraQuandoPronto()
  if (!acendeu) {
    // não deixa o perfil em Continuous Read com o feixe apagado
    perfilEmUso = null
    await nativo.restaurarGatilho(perfil)
  }
  return acendeu
}

/** Desliga o feixe e devolve o perfil ao modo gatilho. Idempotente. */
export async function desligarLeitorContinuo(): Promise<void> {
  if (!nativo) return
  nativo.pararLeitura()
  const perfil = perfilEmUso
  perfilEmUso = null
  if (perfil) await nativo.restaurarGatilho(perfil)
}
