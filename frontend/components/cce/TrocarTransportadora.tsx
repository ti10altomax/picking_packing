'use client'
import { useEffect, useRef, useState } from 'react'
import { cartaCorrecaoApi, type CceCarta, type CcePreparar, type CceTransportadora } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

/**
 * Botão "Transportadora" + modal da carta de correção (ponto 6 da diretoria, 2026-10-22).
 *
 * Fluxo: abre → GET preparar (elegibilidade, situação no Senior, cartas anteriores)
 * → escolhe transportadora (combo com busca em E073TRA) e/ou frete, complemento livre
 * → prévia do texto (servidor monta, sempre repetindo as cartas anteriores)
 * → confirmar → POST executar (grava no Senior; transmite se o modo mandar).
 * Só web: operação de escritório (Sup. Vendas, Sup. Pátio, admin).
 */

const INPUT = 'w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300'

const COR_STATUS: Record<CceCarta['status'], string> = {
  simulada: 'bg-surface-elev text-ink-muted',
  gravada: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  transmitida: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  erro_gravar: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  erro_transmitir: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
}

export function ChipStatusCarta({ carta }: { carta: Pick<CceCarta, 'status' | 'status_label'> }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${COR_STATUS[carta.status] ?? 'bg-surface-elev text-ink-muted'}`}>
      {carta.status_label}
    </span>
  )
}

export function IconeCaminhao({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TrocarTransportadora({
  pedidoId, tipo, compacto = false, onAlterado,
}: {
  pedidoId: number
  tipo?: string
  compacto?: boolean
  onAlterado?: (pedido: { codtra: string; transportadora: string; frete: string }) => void
}) {
  const [aberto, setAberto] = useState(false)
  if (tipo && tipo !== 'nota_fiscal') return null
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Trocar transportadora (carta de correção)"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card text-ink text-xs font-medium hover:bg-surface-elev transition-colors ${compacto ? 'px-2 min-h-[36px]' : 'px-3 min-h-[40px]'}`}
      >
        <IconeCaminhao />
        {!compacto && <span>Transportadora</span>}
      </button>
      {aberto && (
        <ModalCarta
          pedidoId={pedidoId}
          onFechar={() => setAberto(false)}
          onAlterado={(p) => { onAlterado?.(p) }}
        />
      )}
    </>
  )
}

export function ModalCarta({
  pedidoId, onFechar, onAlterado,
}: {
  pedidoId: number
  onFechar: () => void
  onAlterado?: (pedido: { codtra: string; transportadora: string; frete: string }) => void
}) {
  const dialog = useDialog()
  const [dados, setDados] = useState<CcePreparar | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [opcoes, setOpcoes] = useState<CceTransportadora[]>([])
  const [buscando, setBuscando] = useState(false)
  const [escolhida, setEscolhida] = useState<CceTransportadora | null>(null)
  const [frete, setFrete] = useState<'' | 'C' | 'F'>('')
  const [complemento, setComplemento] = useState('')

  const [previa, setPrevia] = useState<{ texto: string; tamanho: number; limite: number } | null>(null)
  const [erroPrevia, setErroPrevia] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<CceCarta | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [mostrarAnteriores, setMostrarAnteriores] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    cartaCorrecaoApi.preparar(pedidoId)
      .then((d) => { setDados(d); if (d.pedido.frete === 'C' || d.pedido.frete === 'F') setFrete(d.pedido.frete) })
      .catch((e) => setErroCarga(e?.response?.data?.erro ?? 'Não consegui carregar os dados da nota.'))
  }, [pedidoId])

  // busca de transportadoras (debounce)
  useEffect(() => {
    if (!dados || dados.bloqueio) return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await cartaCorrecaoApi.transportadoras(busca)
        setOpcoes(r.transportadoras)
      } catch {
        setOpcoes([])
      } finally {
        setBuscando(false)
      }
    }, 250)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [busca, dados])

  // prévia do texto
  useEffect(() => {
    if (!dados || dados.bloqueio || !escolhida) { setPrevia(null); return }
    const t = setTimeout(async () => {
      setErroPrevia(null)
      try {
        const p = await cartaCorrecaoApi.previa(pedidoId, { codtra: escolhida.codtra, frete, complemento })
        setPrevia({ texto: p.texto, tamanho: p.tamanho, limite: p.limite })
      } catch (e: unknown) {
        const err = e as { response?: { data?: { erro?: string } } }
        setErroPrevia(err.response?.data?.erro ?? 'Falha ao montar a prévia.')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [dados, escolhida, frete, complemento, pedidoId])

  const mudaTransportadora = !!escolhida && !!dados && escolhida.codtra !== dados.pedido.codtra
  const mudaFrete = !!frete && !!dados && frete !== dados.pedido.frete
  const haMudanca = mudaTransportadora || mudaFrete || complemento.trim().length > 0
  const textoLongo = !!previa && previa.tamanho > previa.limite
  const podeConfirmar = !!dados && !dados.bloqueio && !!escolhida && haMudanca && !textoLongo && !enviando
    && dados.config.modo !== 'desligado'

  async function confirmar() {
    if (!escolhida) return
    const vaiTransmitir = dados?.config.modo === 'gravar_e_transmitir' && !dados.config.dry_run
    const aviso = vaiTransmitir
      ? 'A carta vai ser GRAVADA e TRANSMITIDA à SEFAZ agora. Isso não tem volta. Continuar?'
      : 'A carta vai ser gravada no Senior como "Não enviada" e a transportadora da nota vai ser trocada. Continuar?'
    if (!dados?.config.dry_run) {
      const ok = await dialog.confirm({
        title: vaiTransmitir ? 'Gravar e transmitir à SEFAZ' : 'Gravar carta no Senior',
        message: aviso, variant: vaiTransmitir ? 'danger' : 'warning',
        confirmText: vaiTransmitir ? 'Gravar e transmitir' : 'Gravar', cancelText: 'Voltar',
      })
      if (!ok) return
    }
    setEnviando(true)
    setErroEnvio(null)
    try {
      const r = await cartaCorrecaoApi.executar(pedidoId, { codtra: escolhida.codtra, frete, complemento })
      setResultado(r.carta)
      if (r.carta.efetiva) onAlterado?.(r.pedido)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { erro?: string } } }
      setErroEnvio(err.response?.data?.erro ?? 'Falha ao gravar a carta.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div
        className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2"><IconeCaminhao /> Trocar transportadora</h2>
            <p className="text-xs text-ink-muted">Carta de correção eletrônica (CC-e) gravada no Senior</p>
          </div>
          <button onClick={onFechar} className="text-ink-muted hover:text-ink min-h-[44px] min-w-[44px] text-xl" aria-label="Fechar">×</button>
        </div>

        {erroCarga && <p className="text-sm text-red-600 dark:text-red-400">{erroCarga}</p>}
        {!dados && !erroCarga && <p className="text-sm text-ink-muted">Consultando o Senior…</p>}

        {dados && (
          <>
            {/* Cabeçalho do documento */}
            <div className="rounded-xl border border-surface-border bg-surface-elev/40 p-3 text-sm mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-ink">NF {dados.pedido.numero_externo}</span>
                <span className="text-xs text-ink-subtle">filial {dados.pedido.codfil} · série {dados.pedido.codsnf}</span>
                {dados.situacao.disponivel && dados.situacao.encontrada && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dados.situacao.autorizada
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'}`}>
                    NF-e {dados.situacao.sitdoe_label || dados.situacao.sitdoe}
                  </span>
                )}
              </div>
              <p className="text-ink-muted truncate">{dados.pedido.cliente || '—'}</p>
              <p className="text-ink mt-1">
                Hoje: <strong>{dados.pedido.transportadora || 'sem transportadora'}</strong>
                {dados.pedido.codtra && <span className="text-ink-subtle"> ({dados.pedido.codtra})</span>}
                {dados.pedido.frete_label && <span className="text-ink-subtle"> · {dados.pedido.frete_label}</span>}
              </p>
              {!dados.situacao.disponivel && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Não consegui ler a situação eletrônica no Senior ({dados.situacao.erro}). O ERP valida ao gravar.
                </p>
              )}
            </div>

            {dados.bloqueio ? (
              <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-300">
                {dados.bloqueio.mensagem}
              </div>
            ) : resultado ? (
              <Resultado carta={resultado} onFechar={onFechar} />
            ) : (
              <>
                {dados.config.modo === 'desligado' && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300 mb-3">
                    Carta de correção está <strong>desligada</strong> na configuração. Um admin liga em Gestão → Cartas de correção.
                  </div>
                )}
                {dados.config.dry_run && dados.config.modo !== 'desligado' && (
                  <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-sm text-blue-800 dark:text-blue-300 mb-3">
                    <strong>Modo simulação (dry-run):</strong> o sistema monta tudo e registra, mas não chama o Senior. Nada muda na nota.
                  </div>
                )}

                {/* Cartas anteriores */}
                {dados.cartas_anteriores.disponivel ? (
                  dados.cartas_anteriores.cartas.length > 0 && (
                    <div className="mb-3 text-sm">
                      <button onClick={() => setMostrarAnteriores((v) => !v)} className="text-blue-600 dark:text-blue-400 text-xs min-h-[32px]">
                        {dados.cartas_anteriores.cartas.length} carta(s) anterior(es) nesta nota — {mostrarAnteriores ? 'ocultar' : 'ver'}
                      </button>
                      {mostrarAnteriores && (
                        <ul className="mt-1 space-y-1">
                          {dados.cartas_anteriores.cartas.map((c, i) => (
                            <li key={i} className="rounded-lg bg-surface-elev/50 p-2 text-xs text-ink">
                              <span className="text-ink-subtle">{c.data} {c.hora} · {c.sitcce_label}{c.protocolo ? ` · prot. ${c.protocolo}` : ''}</span>
                              <p className="mt-0.5 whitespace-pre-wrap">{c.texto}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-ink-subtle mt-1">A última carta substitui as anteriores: o texto novo repete todas elas.</p>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                    Não consegui ler as cartas anteriores no Senior ({dados.cartas_anteriores.erro}). Se a nota já tem carta, o texto dela precisa entrar no complemento.
                  </p>
                )}

                {/* Transportadora nova */}
                <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Transportadora nova</label>
                {escolhida ? (
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`${INPUT} flex items-center justify-between`}>
                      <span><strong>{escolhida.nome}</strong> <span className="text-ink-subtle">({escolhida.codtra})</span></span>
                      <button onClick={() => { setEscolhida(null); setBusca('') }} className="text-xs text-blue-600 dark:text-blue-400 ml-2">trocar</button>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3">
                    <input
                      autoFocus
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por nome ou código no Senior"
                      className={INPUT}
                    />
                    <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-surface-border divide-y divide-surface-border">
                      {buscando && opcoes.length === 0 && <p className="p-2 text-xs text-ink-subtle">Buscando…</p>}
                      {!buscando && opcoes.length === 0 && <p className="p-2 text-xs text-ink-subtle">Nenhuma transportadora encontrada.</p>}
                      {opcoes.map((t) => (
                        <button
                          key={t.codtra}
                          onClick={() => setEscolhida(t)}
                          className={`w-full text-left px-3 py-2 text-sm min-h-[40px] hover:bg-surface-elev ${t.codtra === dados.pedido.codtra ? 'text-ink-subtle' : 'text-ink'}`}
                        >
                          {t.nome} <span className="text-ink-subtle text-xs">({t.codtra}){t.codtra === dados.pedido.codtra ? ' · atual' : ''}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Frete */}
                <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Frete</label>
                <select value={frete} onChange={(e) => setFrete(e.target.value as '' | 'C' | 'F')} className={`${INPUT} mb-3`}>
                  <option value="">Manter como está{dados.pedido.frete_label ? ` (${dados.pedido.frete_label})` : ''}</option>
                  <option value="C">Entrega — por conta do emitente (CIF)</option>
                  <option value="F">Retira — por conta do destinatário (FOB)</option>
                </select>

                {/* Complemento */}
                <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Complemento (opcional)</label>
                <textarea
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  rows={2}
                  placeholder="Texto livre que entra na carta junto com a troca"
                  className={`${INPUT} mb-3`}
                />

                {/* Prévia */}
                {escolhida && (
                  <div className="rounded-xl border border-surface-border bg-surface-elev/40 p-3 mb-3">
                    <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                      <span className="font-semibold uppercase tracking-wide">Texto da carta</span>
                      {previa && <span className={textoLongo ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{previa.tamanho}/{previa.limite}</span>}
                    </div>
                    {erroPrevia ? (
                      <p className="text-sm text-red-600 dark:text-red-400">{erroPrevia}</p>
                    ) : previa ? (
                      previa.texto
                        ? <p className="text-sm text-ink whitespace-pre-wrap font-mono">{previa.texto}</p>
                        : <p className="text-sm text-ink-subtle italic">Nada a corrigir: escolha outra transportadora, mude o frete ou escreva um complemento.</p>
                    ) : (
                      <p className="text-sm text-ink-subtle">Montando…</p>
                    )}
                  </div>
                )}

                {erroEnvio && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{erroEnvio}</p>}

                <div className="flex items-center justify-end gap-2">
                  <button onClick={onFechar} className="px-4 min-h-[44px] rounded-lg text-sm text-ink-muted hover:text-ink">Cancelar</button>
                  <button
                    onClick={confirmar}
                    disabled={!podeConfirmar}
                    className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 min-h-[44px] rounded-lg text-sm font-semibold disabled:opacity-40"
                  >
                    {enviando ? 'Gravando…'
                      : dados.config.dry_run ? 'Simular'
                      : dados.config.modo === 'gravar_e_transmitir' ? 'Gravar e transmitir'
                      : 'Gravar no Senior'}
                  </button>
                </div>
              </>
            )}

            {/* Cartas já feitas pelo Separa nesta nota */}
            {dados.cartas_separa.length > 0 && !resultado && (
              <div className="mt-5 pt-4 border-t border-surface-border">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Feitas pelo Separa</p>
                <ul className="space-y-1.5">
                  {dados.cartas_separa.map((c) => (
                    <li key={c.id} className="flex items-start gap-2 text-xs">
                      <ChipStatusCarta carta={c} />
                      <span className="text-ink">
                        {fmt(c.criado_em)} · {c.usuario ?? '—'} · {c.transportadora_anterior || 'sem transportadora'} → {c.transportadora_nova}
                        {c.erro && <span className="text-red-600 dark:text-red-400"> — {c.erro}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Resultado({ carta, onFechar }: { carta: CceCarta; onFechar: () => void }) {
  const ok = carta.status === 'gravada' || carta.status === 'transmitida' || carta.status === 'simulada'
  return (
    <div className={`rounded-xl border p-4 text-sm ${ok
      ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10'
      : 'border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10'}`}>
      <div className="flex items-center gap-2 mb-2">
        <ChipStatusCarta carta={carta} />
        <span className="font-semibold text-ink">
          {carta.status === 'simulada' && 'Simulação registrada — nada foi enviado ao Senior.'}
          {carta.status === 'gravada' && 'Carta gravada no Senior como "Não enviada". O faturamento transmite por lá.'}
          {carta.status === 'transmitida' && 'Carta gravada e transmitida.'}
          {carta.status === 'erro_transmitir' && 'Carta gravada, mas a transmissão falhou. O faturamento envia pelo Senior.'}
          {carta.status === 'erro_gravar' && 'O Senior não aceitou a carta.'}
        </span>
      </div>
      <p className="text-ink">
        {carta.transportadora_anterior || 'sem transportadora'} → <strong>{carta.transportadora_nova}</strong>
        {carta.frete_novo !== carta.frete_anterior && <> · frete {carta.frete_anterior || '?'} → {carta.frete_novo}</>}
      </p>
      {carta.protocolo && <p className="text-xs text-ink-muted mt-1">Protocolo {carta.protocolo}{carta.autorizada_em ? ` · ${carta.autorizada_em}` : ''}</p>}
      {carta.erro && <p className="text-xs text-red-700 dark:text-red-300 mt-1">{carta.erro}</p>}
      <p className="text-xs text-ink-subtle mt-2 font-mono whitespace-pre-wrap">{carta.texto}</p>
      {carta.efetiva && (
        <p className="text-xs text-ink-muted mt-2">A etiqueta de volume pode ser reimpressa com a transportadora nova.</p>
      )}
      <div className="flex justify-end mt-3">
        <button onClick={onFechar} className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-5 min-h-[44px] rounded-lg text-sm font-semibold">Fechar</button>
      </div>
    </div>
  )
}
