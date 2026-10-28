import Constants from 'expo-constants'
import { Platform } from 'react-native'

/** Versão do APK instalado (app.json → version) e um nome curto do aparelho.
 *  Vão em todo request (X-App-Versao / X-App-Dispositivo → inventário em
 *  Admin → App do coletor) e no relato de erros. Sem import de api.ts para
 *  não criar ciclo (api.ts e erros.ts importam daqui). */
export const VERSAO_APP = Constants.expoConfig?.version ?? '?'
export const DISPOSITIVO = `${Platform.OS} ${Platform.Version} · ${Constants.deviceName ?? 'aparelho'}`.slice(0, 200)

/** '0.9.0' → [0, 9, 0] */
function tupla(v: string): number[] {
  return v.split('.').map((p) => parseInt(p, 10) || 0)
}

/** true quando `nova` é maior que a instalada (comparação numérica por parte) */
export function versaoMaisNova(nova: string, instalada: string = VERSAO_APP): boolean {
  const a = tupla(nova)
  const b = tupla(instalada)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}
