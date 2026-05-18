'use client'
import { useEffect, useRef, useState } from 'react'

type Props = {
  onResultado: (codigo: string) => void
  onFechar: () => void
}

export function CameraScanner({ onResultado, onFechar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ativoRef = useRef(true)
  const ultimoCodigo = useRef<{ codigo: string; ts: number } | null>(null)
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('Iniciando câmera…')
  const [frames, setFrames] = useState(0)
  const [resolucao, setResolucao] = useState('')
  const [readyState, setReadyState] = useState(0)

  function aceitar(codigo: string) {
    const agora = Date.now()
    if (
      ultimoCodigo.current
      && ultimoCodigo.current.codigo === codigo
      && agora - ultimoCodigo.current.ts < 1500
    ) return
    ultimoCodigo.current = { codigo, ts: agora }
    if (navigator.vibrate) navigator.vibrate(60)
    onResultado(codigo)
  }

  useEffect(() => {
    // Strict Mode: o cleanup do primeiro effect pode ter zerado o flag.
    // Reseta no início pra garantir que o segundo effect rode.
    ativoRef.current = true
    let cleanup: (() => void) | null = null

    async function iniciar() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setErro('Câmera não disponível neste navegador (precisa HTTPS).')
          return
        }

        // Pega o stream manualmente — assim sabemos exatamente o que está acontecendo
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        // Diagnóstico: monitora mudanças de readyState
        const onState = () => setReadyState(video.readyState)
        video.addEventListener('loadedmetadata', onState)
        video.addEventListener('loadeddata', onState)
        video.addEventListener('canplay', onState)
        video.addEventListener('canplaythrough', onState)
        video.addEventListener('playing', onState)

        video.srcObject = stream
        try {
          await video.play()
        } catch (playErr) {
          // Alguns navegadores exigem interação — vamos tentar continuar mesmo assim
          console.warn('video.play() falhou:', playErr)
        }

        const track = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        setResolucao(`${settings.width || '?'}×${settings.height || '?'}`)
        setStatus('Aguardando primeiro frame…')

        // Espera ter pelo menos 1 frame decodificado
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2 && video.videoWidth > 0) { resolve(); return }
          const check = () => {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              video.removeEventListener('loadeddata', check)
              video.removeEventListener('canplay', check)
              resolve()
            }
          }
          video.addEventListener('loadeddata', check)
          video.addEventListener('canplay', check)
          // Timeout defensivo: 5s
          setTimeout(() => resolve(), 5000)
        })

        if (video.videoWidth === 0) {
          setErro(`Câmera não enviou frames em 5s (readyState=${video.readyState}). Tente fechar e abrir.`)
          return
        }

        setStatus('Procurando código de barras…')

        // Carrega ZXing
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
        ])
        hints.set(DecodeHintType.TRY_HARDER, true)
        const reader = new BrowserMultiFormatReader(hints)

        // Loop manual: grab frame → tenta decodificar → repete
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          setErro('Não foi possível criar canvas pra leitura.')
          return
        }

        let n = 0
        let stopped = false

        const processarFrame = async () => {
          if (stopped || !ativoRef.current) return
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          n++
          setFrames(n)
          try {
            const result = await reader.decodeFromCanvas(canvas)
            if (result) aceitar(result.getText())
          } catch {
            // Frame sem código — normal
          }
        }

        // setInterval simples: 150ms entre tentativas de leitura
        const id = setInterval(async () => {
          if (stopped || !ativoRef.current) return
          if (video.paused || video.readyState < 2 || video.videoWidth === 0) return
          await processarFrame()
        }, 150)
        cleanup = () => { stopped = true; clearInterval(id) }
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string }
        if (err?.name === 'NotAllowedError') {
          setErro('Permissão de câmera negada — autorize nas configurações do navegador.')
        } else if (err?.name === 'NotFoundError') {
          setErro('Nenhuma câmera encontrada.')
        } else if (err?.name === 'NotReadableError') {
          setErro('Câmera em uso por outro app. Feche e tente de novo.')
        } else {
          setErro(`${err?.name ?? 'Erro'}: ${err?.message ?? 'Falha ao iniciar câmera.'}`)
        }
      }
    }

    iniciar()

    return () => {
      ativoRef.current = false
      if (cleanup) cleanup()
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-md aspect-[5/3]">
          <div className="absolute inset-0 border-2 border-white/30 rounded-2xl" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
          {(['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl',
             'top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl',
             'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
             'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'] as const).map((c) => (
            <div key={c} className={`absolute w-10 h-10 border-emerald-400 ${c}`} />
          ))}
          <div className="absolute left-2 right-2 top-1/2 h-[2px] bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153)] animate-pulse" />
        </div>
      </div>

      <div className="relative mt-auto p-4 pb-8 text-center space-y-1">
        {erro ? (
          <p className="text-red-400 text-sm bg-black/60 rounded-xl py-3 px-4">{erro}</p>
        ) : (
          <>
            <p className="text-white/90 text-sm">{status}</p>
            <p className="text-white/40 text-xs font-mono">
              {frames} frames {resolucao && `· ${resolucao}`} · rs={readyState}
            </p>
          </>
        )}
      </div>

      <button
        onClick={onFechar}
        className="absolute top-4 right-4 w-12 h-12 rounded-full bg-black/60 text-white text-2xl flex items-center justify-center backdrop-blur-sm"
        aria-label="Fechar câmera"
      >
        ×
      </button>
    </div>
  )
}
