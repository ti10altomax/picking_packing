import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Modal, Vibration, ActivityIndicator } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera'

type Props = {
  onResultado: (codigo: string) => void
  onFechar: () => void
}

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

export function CameraScanner({ onResultado, onFechar }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const ultimoCodigo = useRef<{ codigo: string; ts: number } | null>(null)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!permission) return
    if (!permission.granted && permission.canAskAgain) {
      requestPermission()
    }
  }, [permission])

  function aoLer(result: BarcodeScanningResult) {
    const codigo = result.data
    if (!codigo) return
    // Debounce — mesma leitura em frames seguidos não dispara N vezes
    const agora = Date.now()
    if (
      ultimoCodigo.current
      && ultimoCodigo.current.codigo === codigo
      && agora - ultimoCodigo.current.ts < 1500
    ) return
    ultimoCodigo.current = { codigo, ts: agora }
    Vibration.vibrate(60)
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
            <View className="absolute bottom-12 left-0 right-0 items-center">
              <Text className="text-white/80 text-sm bg-black/40 px-4 py-2 rounded-full">
                {pronto ? 'Aponte para o código de barras' : 'Iniciando câmera…'}
              </Text>
            </View>

            {/* Botão fechar */}
            <Pressable
              onPress={onFechar}
              className="absolute top-12 right-4 w-12 h-12 rounded-full bg-black/60 items-center justify-center"
            >
              <Text className="text-white text-2xl">×</Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  )
}
