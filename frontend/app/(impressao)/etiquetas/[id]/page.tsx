'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api, impressaoApi, type EtiquetasPedido, type EtiquetaVolume, type ModeloEtiqueta } from '@/lib/api'
import { svgCode128 } from '@/lib/code128'

/**
 * Etiquetas de volume 10x15 cm para imprimir pelo navegador (qualquer
 * impressora) — mesmo conteúdo do ZPL que vai para a Zebra. Uma etiqueta por
 * volume com itens; o que passa do que cabe vira página de continuação.
 *
 * Dois modelos (Configuracao.etiqueta_modelo; `?modelo=compacta` na URL força
 * um para comparar): `padrao` (descrição + SKU, 10 por etiqueta) e `compacta`
 * (só SKU em 18 linhas × 2 ou 3 colunas, pedido da supervisão em 2026-10-23).
 * Cabeçalho e rodapé são os mesmos — 1 mm aqui ≈ 8 dots do ZPL.
 *
 * 2026-10-26: "pág. N/M"; NF ao lado do pedido e no código de barras quando já
 * existe, com "NF/PEDIDO nº" pequeno embaixo; rodapé sem endereço/telefone;
 * compacta com 3 colunas quando nenhuma quantidade do volume passa de 99.
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
  width: 100mm; height: 150mm; box-sizing: border-box; padding: 3mm 3mm;   /* 3mm = os 24 dots do ZPL */
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

function linhaVolume(et: EtiquetaVolume) {
  const partes = [et.volume.tipo_label.toUpperCase()]
  if (et.volume.identificador) partes.push(et.volume.identificador)
  partes.push(`${et.qtd_unidades} unid. em ${et.qtd_itens} item(ns)`)
  return partes.join('  ·  ')
}

/** Marca + caixa "VOLUME N / M" + documento com Code 128 — igual nos dois modelos */
function Cabecalho({ dados, et }: { dados: EtiquetasPedido; et: EtiquetaVolume }) {
  const p = dados.pedido
  const cab = (p.tipo === 'nota_fiscal'
    ? `NOTA FISCAL${p.codsnf ? ` · série ${p.codsnf}` : ''}`
    : 'PEDIDO') + (p.codfil ? ` · filial ${p.codfil}` : '')
  const rotuloVol = et.total_paginas > 1 ? `VOLUME · pág. ${et.pagina}/${et.total_paginas}` : 'VOLUME'
  const barra = dados.barra

  return (
    <>
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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2mm', minWidth: 0 }}>
            <div style={{ fontSize: '8mm', fontWeight: 800, lineHeight: 1.05 }}>{p.numero_externo}</div>
            {p.nf_numero && (
              <div className="corta" style={{ fontSize: '5mm', fontWeight: 800, lineHeight: 1.05 }}>NF {p.nf_numero}</div>
            )}
          </div>
        </div>
        <div style={{ width: '38mm', paddingTop: '0.5mm', textAlign: 'center' }}>
          <div dangerouslySetInnerHTML={{ __html: svgCode128(barra.valor, '9mm', '38mm') }} />
          <div style={{ fontSize: '2mm', fontWeight: 700, lineHeight: 1, marginTop: '0.3mm' }}>{barra.rotulo} {barra.valor}</div>
        </div>
      </div>
    </>
  )
}

/** Antiga carta de transporte + "Conferido em" — igual nos dois modelos */
function Rodape({ dados }: { dados: EtiquetasPedido }) {
  const p = dados.pedido
  return (
    <>
      <div className="hr" />
      <div className="corta" style={{ fontSize: '2.7mm', fontWeight: 700 }}>{dados.rodape.titulo}</div>
      <div className="corta" style={{ fontSize: '2.5mm', fontWeight: 700, lineHeight: 1.2 }}>{dados.rodape.subtitulo}</div>
      <ul style={{ margin: '0.3mm 0 0', paddingLeft: '3mm', fontSize: '2.25mm', lineHeight: 1.25 }}>
        {dados.rodape.responsabilidades.map((t, idx) => <li key={idx}>{t}</li>)}
      </ul>
      <div className="hr-fina" />
      <div className="corta" style={{ fontSize: '2.5mm' }}>
        {p.conferido_em ? `Conferido em ${fmtData(p.conferido_em)}` : 'Conferência concluída'}
        {p.conferente ? ` · por ${p.conferente}` : ''}
        {p.sequencia_numero ? ` · Seq. ${p.sequencia_numero}` : ''}
        {' · Separa'}
      </div>
    </>
  )
}

/** Modelo original (2026-10-07): descrição + SKU por item, 10 itens por etiqueta (eram 8 até 26/10) */
function EtiquetaPadrao({ dados, et }: { dados: EtiquetasPedido; et: EtiquetaVolume }) {
  const p = dados.pedido

  return (
    <div className="etq shadow-xl">
      <Cabecalho dados={dados} et={et} />
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
      <div className="corta" style={{ fontSize: '3.3mm', fontWeight: 700 }}>{linhaVolume(et)}</div>
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
      <Rodape dados={dados} />
    </div>
  )
}

/**
 * Modelo compacto (2026-10-23): só o SKU, em 18 linhas × 2 ou 3 colunas (36 ou
 * 54 por etiqueta; 3 colunas só quando toda quantidade do volume tem até 2
 * dígitos e todo SKU até 16 caracteres — decidido no backend, `et.colunas`; a
 * fonte dos itens é a mesma nos dois casos). Cliente e transportadora em uma
 * linha cada — é o espaço que o padrão reservava para a 2ª linha que vira itens.
 * As colunas enchem da esquerda para a direita, de cima para baixo; a divisória
 * só aparece entre colunas usadas.
 */
function EtiquetaCompacta({ dados, et }: { dados: EtiquetasPedido; et: EtiquetaVolume }) {
  const p = dados.pedido
  const nCol = et.colunas === 3 ? 3 : 2
  const linhas = dados.linhas || 18
  const colunas = Array.from({ length: nCol }, (_, c) => et.itens.slice(c * linhas, (c + 1) * linhas))
  const usadas = Math.max(1, Math.min(nCol, Math.ceil(et.itens.length / linhas)))
  const grid = `repeat(${nCol}, 1fr)`
  // O TAMANHO da fonte do SKU é o mesmo nas 2 ou 3 colunas (ordem da supervisão: não
  // diminuir). Nas 3 colunas a Arial comum não cabe (16 caracteres ≈ 27mm numa coluna de
  // ~26mm), então o texto é condensado com scaleX(0.83) — mesma altura, letras mais
  // estreitas, exatamente a proporção 24/20 da fonte que a Zebra usa no compacto aprovado.
  // (Arial Narrow dependeria de estar instalada na máquina que imprime.)
  const gap = nCol === 3 ? '1mm' : '2mm'
  const largQtd = nCol === 3 ? '4mm' : '9mm'
  const condensa = nCol === 3
  const cabecalhoColuna = (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.5mm', fontWeight: 700, lineHeight: 1.1 }}>
      <span>SKU</span><span>QTD</span>
    </div>
  )

  return (
    <div className="etq shadow-xl">
      <Cabecalho dados={dados} et={et} />
      <div className="corta" style={{ fontSize: '3.3mm', fontWeight: 700, lineHeight: 1.15, marginTop: '0.8mm' }}>
        {p.cliente || '—'}
      </div>
      <div className="hr" style={{ margin: '0.8mm 0' }} />

      {/* Transportadora */}
      <div className="mini" style={{ fontSize: '2.5mm', lineHeight: 1.1 }}>Transportadora</div>
      <div className="corta" style={{ fontSize: '5.2mm', fontWeight: 800, lineHeight: 1.05 }}>
        {p.transportadora || '—'}
      </div>
      <div className="hr" style={{ margin: '0.8mm 0' }} />

      {/* Itens em 2 ou 3 colunas */}
      <div className="corta" style={{ fontSize: '3.1mm', fontWeight: 700, lineHeight: 1.15 }}>{linhaVolume(et)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: grid, columnGap: gap, marginTop: '0.6mm' }}>
        {colunas.map((_, c) => (c < usadas ? <div key={c}>{cabecalhoColuna}</div> : <div key={c} />))}
      </div>
      <div className="hr-fina" style={{ margin: '0.3mm 0 0.4mm' }} />
      {/* 18 linhas de 3.75mm = 67.5mm (o rodapé perdeu as linhas da empresa em 26/10) */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: grid, columnGap: gap, alignContent: 'start', position: 'relative' }}>
        {colunas.map((col, c) => (
          <div key={c} style={{ minWidth: 0, borderLeft: c > 0 && c < usadas ? '0.25mm solid #000' : 'none', marginLeft: c > 0 ? `calc(-${gap} / 2)` : 0, paddingLeft: c > 0 ? `calc(${gap} / 2)` : 0 }}>
            {col.map((i, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: nCol === 3 ? '0.5mm' : '1mm', height: '3.75mm' }}>
                <div className={condensa ? '' : 'corta'} style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '2.7mm', fontWeight: 700, lineHeight: 1 }}>
                  <span style={condensa ? { display: 'inline-block', transform: 'scaleX(0.83)', transformOrigin: 'left center' } : undefined}>{i.sku || i.descricao}</span>
                </div>
                <div className="corta" style={{ fontSize: '3.4mm', fontWeight: 800, minWidth: largQtd, textAlign: 'right', lineHeight: 1 }}>{i.qtd}</div>
              </div>
            ))}
          </div>
        ))}
        {et.itens.length === 0 && <div style={{ fontSize: '3mm' }}>(volume sem itens)</div>}
      </div>
      <Rodape dados={dados} />
    </div>
  )
}

function Etiqueta(props: { dados: EtiquetasPedido; et: EtiquetaVolume }) {
  return props.dados.modelo === 'compacta' ? <EtiquetaCompacta {...props} /> : <EtiquetaPadrao {...props} />
}

export default function EtiquetasPedidoPage() {
  const params = useParams()
  const pedidoId = Number(params.id)
  const [dados, setDados] = useState<EtiquetasPedido | null>(null)
  const [erro, setErro] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [aviso, setAviso] = useState('')
  // `?modelo=padrao|compacta` força o modelo (comparar os dois); sem ele vale o configurado
  const [modelo, setModelo] = useState<ModeloEtiqueta | undefined>(undefined)

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('modelo')
    const forcado = m === 'padrao' || m === 'compacta' ? m : undefined
    setModelo(forcado)
    impressaoApi.etiquetas(pedidoId, forcado).then(setDados).catch(() => setErro('Erro ao carregar as etiquetas'))
  }, [pedidoId])

  async function imprimir() {
    if (!dados || dados.bloqueio) return
    setRegistrando(true)
    try {
      // Registra o disparo (histórico + sai da lista de pendentes) e abre a impressão
      await impressaoApi.imprimir(pedidoId, { canal: 'navegador' })
      setAviso('Impressão registrada.')
      const d = await impressaoApi.etiquetas(pedidoId, modelo)
      setDados(d)
    } catch {
      setAviso('Não foi possível registrar a impressão (a página ainda pode ser impressa).')
    } finally {
      setRegistrando(false)
    }
    window.print()
  }

  async function baixarZpl() {
    const r = await api.get(impressaoApi.zplUrl(pedidoId, modelo), { responseType: 'blob' })
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
            {' · modelo '}{dados.modelo === 'compacta' ? 'compacto' : 'padrão'}{modelo ? ' (forçado pela URL)' : ''}
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
