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
 * sem timeout + mesmo código só depois de `mesmoCodigoMs`, (3) ligar a "vigia": o módulo
 * escuta o status do scanner, manda START_SCANNING quando ele está pronto e manda de novo
 * toda vez que o feixe apaga (coletor que ignora o Continuous Read e apaga após 1 leitura,
 * gatilho físico apertado, recarga do perfil). Resolve true no primeiro SCANNING. A leitura
 * continua chegando como teclado na barra de bipagem, igual ao gatilho — e como nesses
 * coletores a peça ainda está na frente quando o feixe reacende, a tela repete a trava do
 * mesmo código (`INTERVALO_REPETIR_MS`) por conta própria. Desligar = parar a vigia +
 * STOP_SCANNING + perfil de volta ao modo Trigger.
 */
type Nativo = {
  temDataWedge(): boolean
  perfilAtivo(): Promise<string | null>
  configurarLeituraContinua(perfil: string, mesmoCodigoMs: number): Promise<boolean>
  restaurarGatilho(perfil: string): Promise<boolean>
  iniciarLeitura(): boolean
  pararLeitura(): boolean
  criarPerfil(nome: string, origem: string): Promise<boolean>
  ligarVigia(): Promise<boolean>
  desligarVigia(): void
  lerParametrosLeitor(perfil: string): Promise<Record<string, string | null>>
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

/** Perfil do DataWedge que o app cria para si (clonado do perfil ativo na 1ª vez). No DW 11.4 o
 *  SET_CONFIG no "Profile0 (default)" responde SUCCESS sem gravar — só perfil próprio obedece. */
export const PERFIL_SEPARA = 'Separa'

/** Liga o leitor em modo contínuo. Devolve false se o DataWedge não respondeu ou o feixe não acendeu. */
export async function ligarLeitorContinuo(mesmoCodigoMs: number): Promise<boolean> {
  if (!nativo) return false
  let perfil = await nativo.perfilAtivo()
  if (!perfil) return false
  if (perfil !== PERFIL_SEPARA) {
    // 1ª vez neste coletor: cria o perfil do app clonando o que está em uso; se o DataWedge
    // recusar (ex.: app já associado a outro perfil, como no coletor configurado à mão), segue
    // no perfil ativo mesmo
    const criado = await nativo.criarPerfil(PERFIL_SEPARA, perfil)
    if (criado) perfil = PERFIL_SEPARA
  }
  const ok = await nativo.configurarLeituraContinua(perfil, mesmoCodigoMs)
  if (!ok) return false
  // diagnóstico: o que o DataWedge realmente guardou (vai pro logcat, tag SeparaDW)
  await nativo.lerParametrosLeitor(perfil).catch(() => null)
  perfilEmUso = perfil
  const acendeu = await nativo.ligarVigia()
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
  nativo.desligarVigia()
  const perfil = perfilEmUso
  perfilEmUso = null
  if (perfil) await nativo.restaurarGatilho(perfil)
}
