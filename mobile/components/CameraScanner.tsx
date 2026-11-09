import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Modal, Vibration, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera'
import { ToastHost } from '@/components/Toast'

/**
 * Leitor por câmera (celular comum, sem o leitor do TC21).
 *
 * `continuo` (2026-11-09, pedido do usuário): a câmera fica ligada e lê um código atrás do
 * outro — um toque no 📷 liga, o × desliga — em vez de abrir e fechar a cada bip. Para o
 * conferente não lançar duas vezes a peça que ficou na frente da lente, o MESMO código só
 * vale de novo depois de `INTERVALO_REPETIR_MS`; código diferente passa na hora. O último
 * lido fica escrito embaixo, com a contagem. Os toasts da tela (✓ +1, erro de item) aparecem
 * por cima da câmera (`ToastHost` dentro do Modal). Sem `continuo`, fecha na primeira
 * leitura (quem chama decide — ex.: pegar documento, campo de código do modal de quantidade).
 */
type Props = {
  onResultado: (codigo: string) => void
  onFechar: () => void
  continuo?: boolean
}

/** Tempo mínimo entre duas leituras do MESMO código no modo contínuo */
export const INTERVALO_REPETIR_MS = 3000

const FORMATOS_SUPORTADOS: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'code93',
  'codabar',
  'itf14',
] as never

export function CameraScanner({ onResultado, onFechar, continuo = false }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const ultimoCodigo = useRef<{ codigo: string; ts: number } | null>(null)
  const [pronto, setPronto] = useState(false)
  // modo contínuo: último código lido + segundos que faltam para ele valer de novo
  const [ultimo, setUltimo] = useState<{ codigo: string; ts: number } | null>(null)
  const [restante, setRestante] = useState(0)
  const [lidos, setLidos] = useState(0)

  useEffect(() => {
    if (!continuo || !ultimo) return
    const tick = () => setRestante(Math.max(0, Math.ceil((ultimo.ts + INTERVALO_REPETIR_MS - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [continuo, ultimo])

  useEffect(() => {
    if (!permission) return
    if (!permission.granted && permission.canAskAgain) {
      requestPermission()
    }
  }, [permission])

  function aoLer(result: BarcodeScanningResult) {
    const codigo = result.data
    if (!codigo) return
    // Debounce — mesma leitura em frames seguidos não dispara N vezes; no contínuo o mesmo
    // código espera INTERVALO_REPETIR_MS (conferente que demora a tirar a peça da frente)
    const agora = Date.now()
    const janela = continuo ? INTERVALO_REPETIR_MS : 1500
    if (
      ultimoCodigo.current
      && ultimoCodigo.current.codigo === codigo
      && agora - ultimoCodigo.current.ts < janela
    ) return
    ultimoCodigo.current = { codigo, ts: agora }
    Vibration.vibrate(60)
    if (continuo) {
      setUltimo({ codigo, ts: agora })
      setLidos((n) => n + 1)
    }
    onResultado(codigo)
  }

  return (
    <Modal visible animationType="fade" onRequestClose={onFechar}>
      <View className="flex-1 bg-black">
        {!permission ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#a1a1aa" />
          </View>
        ) : !permission.granted ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-white text-base text-center mb-4">
              O Separa precisa de permissão pra usar a câmera.
            </Text>
            <Pressable
              onPress={requestPermission}
              className="bg-blue-500 active:bg-blue-400 px-6 h-12 rounded-xl items-center justify-center mb-3"
            >
              <Text className="text-white font-bold">Conceder permissão</Text>
            </Pressable>
            <Pressable onPress={onFechar} className="px-6 h-12 items-center justify-center">
              <Text className="text-white/60">Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              onCameraReady={() => setPronto(true)}
              onBarcodeScanned={aoLer}
              barcodeScannerSettings={{ barcodeTypes: FORMATOS_SUPORTADOS }}
            />

            {/* Overlay com janela de scan */}
            <View className="absolute inset-0 pointer-events-none">
              <View className="flex-1 items-center justify-center">
                <View className="w-72 h-44 border-2 border-white/40 rounded-2xl">
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((pos) => (
                    <View
                      key={pos}
                      className={`absolute w-10 h-10 border-emerald-400 ${
                        pos === 'top-left' ? 'top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl' :
                        pos === 'top-right' ? 'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl' :
                        pos === 'bottom-left' ? 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl' :
                        'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'
                      }`}
                    />
                  ))}
                  <View className="absolute left-2 right-2 top-1/2 h-0.5 bg-emerald-400" />
                </View>
              </View>
            </View>

            {/* Status */}
            <View className="absolute bottom-12 left-0 right-0 items-center px-6">
              {continuo && ultimo ? (
                <View className="bg-black/60 px-4 py-2.5 rounded-2xl items-center">
                  <Text className="text-white text-xs opacity-80">
                    Lido ({lidos}): <Text className="font-mono text-[13px]">{ultimo.codigo}</Text>
                  </Text>
                  <Text className={`text-sm mt-0.5 ${restante > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {restante > 0 ? `mesmo código de novo em ${restante} s · outro código já vale` : 'Pronto — aponte para o próximo'}
                  </Text>
                </View>
              ) : (
                <Text className="text-white/80 text-sm bg-black/40 px-4 py-2 rounded-full">
                  {!pronto ? 'Iniciando câmera…' : continuo ? 'Câmera ligada — bipe um código atrás do outro · × desliga' : 'Aponte para o código de barras'}
                </Text>
              )}
            </View>

            {/* Botão fechar (no contínuo é o "desliga") */}
            <Pressable
              onPress={onFechar}
              accessibilityLabel={continuo ? 'Desligar a câmera' : 'Fechar'}
              className={`absolute top-12 right-4 h-12 rounded-full bg-black/60 items-center justify-center ${continuo ? 'px-4 flex-row' : 'w-12'}`}
            >
              <Text className="text-white text-2xl">×</Text>
              {continuo ? <Text className="text-white text-sm ml-2 font-semibold">Desligar</Text> : null}
            </Pressable>

            {/* Toasts da tela por cima da câmera (o Modal cobre o host da raiz) */}
            {continuo ? <ToastHost topo={56} /> : null}
          </>
        )}
      </View>
    </Modal>
  )
}
