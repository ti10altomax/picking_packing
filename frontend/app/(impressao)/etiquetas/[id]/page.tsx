'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, impressaoApi, type EtiquetasPedido, type EtiquetaVolume } from '@/lib/api'
import { svgCode128 } from '@/lib/code128'

/**
 * Etiquetas de volume 10x15 cm para imprimir pelo navegador (qualquer
 * impressora) — mesmo conteúdo do ZPL que vai para a Zebra. Uma etiqueta por
 * volume com itens; volume com mais de 8 itens vira páginas de continuação.
 */

const CSS = `
@page { size: 100mm 150mm; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .etq { box-shadow: none !important; margin: 0 !important; }
  .etq + .etq { break-before: page; page-break-before: always; }
}
.etq {
  width: 100mm; height: 150mm; box-sizing: border-box; padding: 3mm 3.5mm;
  background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif;
  overflow: hidden; display: flex; flex-direction: column; break-inside: avoid;
}
.etq .hr { border-top: 0.5mm solid #000; margin: 1.2mm 0; }
.etq .hr-fina { border-top: 0.25mm solid #000; margin: 0.8mm 0; }
.etq .mini { font-size: 2.6mm; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
.etq .corta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.etq .duas { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.etq ul { list-style: disc; }
`

function fmtData(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Etiqueta({ dados, et }: { dados: EtiquetasPedido; et: EtiquetaVolume }) {
  const p = dados.pedido
  const cab = (p.tipo === 'nota_fiscal'
    ? `NOTA FISCAL${p.codsnf ? ` · série ${p.codsnf}` : ''}`
    : 'PEDIDO') + (p.codfil ? ` · filial ${p.codfil}` : '')
  const rotuloVol = et.total_paginas > 1 ? `VOLUME · cont. ${et.pagina}/${et.total_paginas}` : 'VOLUME'
  const partes = [et.volume.tipo_label.toUpperCase()]
  if (et.volume.identificador) partes.push(et.volume.identificador)
  partes.push(`${et.qtd_unidades} unid. em ${et.qtd_itens} item(ns)`)

  return (
    <div className="etq shadow-xl">
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '12mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-altomax.jpg" alt="Altomax" style={{ height: '10mm', width: 'auto' }} />
        <div style={{ border: '0.6mm solid #000', width: '38mm', height: '11.5mm', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: et.total_paginas > 1 ? '2.3mm' : '2.8mm', fontWeight: 700 }}>{rotuloVol}</div>
          <div style={{ fontSize: '7mm', fontWeight: 800, lineHeight: 1 }}>{et.volume.numero} / {dados.total_volumes}</div>
        </div>
      </div>
      <div className="hr" />

      {/* Documento */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '3mm' }}>
        <div style={{ minWidth: 0 }}>
          <div className="mini corta">{cab}</div>
          <div style={{ fontSize: '8mm', fontWeight: 800, lineHeight: 1.05 }}>{p.numero_externo}</div>
        </div>
        <div style={{ width: '38mm', paddingTop: '0.5mm' }}
          dangerouslySetInnerHTML={{ __html: svgCode128(p.numero_externo, '9mm', '38mm') }} />
      </div>
      <div className="duas" style={{ fontSize: '3.6mm', fontWeight: 700, lineHeight: 1.15, marginTop: '0.8mm', minHeight: '4.2mm' }}>
        {p.cliente || '—'}
      </div>
      <div className="hr" />

      {/* Transportadora */}
      <div className="mini">Transportadora</div>
      <div className="duas" style={{ fontSize: '5.2mm', fontWeight: 800, lineHeight: 1.05, minHeight: '5.6mm' }}>
        {p.transportadora || '—'}
      </div>
      <div className="hr" />

      {/* Itens */}
      <div className="corta" style={{ fontSize: '3.3mm', fontWeight: 700 }}>{partes.join('  ·  ')}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.6mm', fontWeight: 700, marginTop: '0.6mm' }}>
        <span>ITEM</span><span>QTD</span>
      </div>
      <div className="hr-fina" style={{ margin: '0.3mm 0 0.6mm' }} />
      <div style={{ flex: 1, minHeight: 0 }}>
        {et.itens.length === 0 && <div style={{ fontSize: '3mm' }}>(volume sem itens)</div>}
        {et.itens.map((i, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '2mm', height: '5.4mm' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="corta" style={{ fontSize: '3mm', fontWeight: 700, lineHeight: 1.1 }}>{i.descricao || i.sku}</div>
              <div className="corta" style={{ fontSize: '2.2mm', lineHeight: 1.1 }}>{i.sku}</div>
            </div>
            <div style={{ fontSize: '4.4mm', fontWeight: 800, minWidth: '12mm', textAlign: 'right' }}>{i.qtd}</div>
          </div>
        ))}
      </div>
      <div className="hr" />

      {/* Rodapé — antiga carta de transporte */}
      <div className="corta" style={{ fontSize: '2.7mm', fontWeight: 700 }}>{dados.rodape.titulo} · responsabilidade do lojista</div>
      <ul style={{ margin: '0.4mm 0 0', paddingLeft: '3mm', fontSize: '2.25mm', lineHeight: 1.25 }}>
        {dados.rodape.responsabilidades.map((t, idx) => <li key={idx}>{t}</li>)}
      </ul>
      <div style={{ fontSize: '2.25mm', lineHeight: 1.25, marginTop: '0.8mm' }}>
        {dados.rodape.empresa.map((t, idx) => <div key={idx} className="corta">{t}</div>)}
      </div>
      <div className="hr-fina" />
      <div className="corta" style={{ fontSize: '2.5mm' }}>
        {p.conferido_em ? `Conferido em ${fmtData(p.conferido_em)}` : 'Conferência concluída'}
        {p.conferente ? ` · por ${p.conferente}` : ''}
        {p.sequencia_numero ? ` · Seq. ${p.sequencia_numero}` : ''}
        {' · Separa'}
      </div>
    </div>
  )
}

export default function EtiquetasPedidoPage() {
  const params = useParams()
  const pedidoId = Number(params.id)
  const [dados, setDados] = useState<EtiquetasPedido | null>(null)
  const [erro, setErro] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    impressaoApi.etiquetas(pedidoId).then(setDados).catch(() => setErro('Erro ao carregar as etiquetas'))
  }, [pedidoId])

  async function imprimir() {
    if (!dados || dados.bloqueio) return
    setRegistrando(true)
    try {
      // Registra o disparo (histórico + sai da lista de pendentes) e abre a impressão
      await impressaoApi.imprimir(pedidoId, { canal: 'navegador' })
      setAviso('Impressão registrada.')
      const d = await impressaoApi.etiquetas(pedidoId)
      setDados(d)
    } catch {
      setAviso('Não foi possível registrar a impressão (a página ainda pode ser impressa).')
    } finally {
      setRegistrando(false)
    }
    window.print()
  }

  async function baixarZpl() {
    const r = await api.get(impressaoApi.zplUrl(pedidoId), { responseType: 'blob' })
    const url = URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `etiquetas-${dados?.pedido.numero_externo ?? pedidoId}.zpl`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (erro) return <p className="text-red-500 p-6">{erro}</p>
  if (!dados) return <p className="text-ink-muted p-6">Carregando…</p>

  const ultima = dados.impressoes.find((i) => i.status === 'ok')

  return (
    <div className="min-h-screen bg-surface-bg">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Barra de ações (some na impressão) */}
      <div className="no-print sticky top-0 z-10 bg-surface-card border-b border-surface-border px-4 py-3 flex flex-wrap items-center gap-3">
        <button onClick={() => window.close()} className="text-ink-muted hover:text-ink min-h-[44px] px-2 -ml-2" title="Fechar">←</button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-semibold text-ink leading-tight">
            Etiquetas · {dados.pedido.tipo_label} {dados.pedido.numero_externo}
          </h1>
          <p className="text-xs text-ink-muted">
            {dados.total_volumes} volume(s) · {dados.etiquetas.length} etiqueta(s) · {dados.pedido.transportadora || 'sem transportadora'}
            {ultima && ` · última impressão ${fmtData(ultima.criado_em)} (${ultima.canal_label}${ultima.impressora ? ` ${ultima.impressora}` : ''})`}
          </p>
        </div>
        <button onClick={baixarZpl} className="text-sm text-ink-muted hover:text-ink underline underline-offset-2 min-h-[44px] px-2" title="ZPL para testar numa Zebra">
          Baixar ZPL
        </button>
        <button
          onClick={imprimir}
          disabled={!!dados.bloqueio || registrando}
          className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 h-11 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {registrando ? 'Registrando…' : 'Imprimir'}
        </button>
      </div>

      {dados.bloqueio && (
        <div className="no-print mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 px-4 py-3 text-sm">
          <strong>Não pode imprimir ainda:</strong> {dados.bloqueio.mensagem}
        </div>
      )}
      {aviso && <p className="no-print mx-4 mt-3 text-xs text-ink-muted">{aviso}</p>}

      {/* Etiquetas */}
      <div className="no-print-wrap flex flex-col items-center gap-6 py-6 print:block print:p-0 print:gap-0">
        {dados.etiquetas.map((et, idx) => <Etiqueta key={idx} dados={dados} et={et} />)}
        {dados.etiquetas.length === 0 && (
          <p className="no-print text-ink-muted">Nenhum volume com itens para etiquetar.</p>
        )}
      </div>
    </div>
  )
}
