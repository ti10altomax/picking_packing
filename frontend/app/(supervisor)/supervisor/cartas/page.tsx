'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DocBadges } from '@/components/ui/DocBadges'
import { ChipStatusCarta, ModalCarta, IconeCaminhao, resumoMudancas, rotuloDocumento } from '@/components/cce/TrocarTransportadora'
import { cartaCorrecaoApi, type CceCarta, type CceConfig, type CceDocumento, type CceModo, type CceTexto } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

/**
 * Gestão → Cartas de correção (ponto 6 da diretoria, 2026-10-22).
 * 1) buscar um documento (nº da NF, nº do pedido ou cliente) e corrigir transportadora, frete
 *    e/ou volumes da nota (qualquer status, menos cancelado). Número de NF que o Separa não
 *    conhece → o servidor pergunta ao Senior de qual pedido ela saiu e vincula;
 * 2) histórico das cartas feitas pelo Separa, com o rastro dos WS;
 * 3) configuração (admin): modo desligado | gravar | gravar e transmitir; texto montado | livre.
 */

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', selecionado: 'Selecionado', atribuido: 'Atribuído', conferindo: 'Em conferência',
  aguardando_fechamento: 'Aguardando fechamento', conferido: 'Conferido', nao_conforme: 'Não conforme', cancelado: 'Cancelado',
}

const MODO_LABEL: Record<CceModo, string> = {
  desligado: 'Desligado',
  gravar: 'Só gravar (o faturamento transmite no Senior)',
  gravar_e_transmitir: 'Gravar e transmitir à SEFAZ',
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function CartasCorrecaoPage() {
  const { user } = useAuthStore()
  const admin = user?.perfil === 'admin'

  const [busca, setBusca] = useState('')
  const [docs, setDocs] = useState<CceDocumento[]>([])
  const [avisoBusca, setAvisoBusca] = useState('')
  const [buscando, setBuscando] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [modalPedido, setModalPedido] = useState<number | null>(null)

  const [cartas, setCartas] = useState<CceCarta[]>([])
  const [config, setConfig] = useState<CceConfig | null>(null)
  const [filtro, setFiltro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroConfig, setErroConfig] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await cartaCorrecaoApi.listar(filtro ? { status: filtro } : {})
      setCartas(r.cartas)
      setConfig(r.config)
    } finally {
      setCarregando(false)
    }
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])

  // busca do documento (Separa; número desconhecido → servidor consulta o Senior)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const termo = busca.trim()
    if (!termo) { setDocs([]); setAvisoBusca(''); return }
    debounce.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await cartaCorrecaoApi.documentos(termo)
        setDocs(r.documentos)
        setAvisoBusca(r.aviso)
      } catch {
        setDocs([])
        setAvisoBusca('')
      } finally {
        setBuscando(false)
      }
    }, 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [busca])

  async function salvarModo(modo: CceModo) {
    setSalvando(true)
    setErroConfig(null)
    try {
      setConfig(await cartaCorrecaoApi.salvarConfig({ modo }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { erro?: string } } }
      setErroConfig(err.response?.data?.erro ?? 'Falha ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarTexto(texto: CceTexto) {
    setSalvando(true)
    setErroConfig(null)
    try {
      setConfig(await cartaCorrecaoApi.salvarConfig({ texto }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { erro?: string } } }
      setErroConfig(err.response?.data?.erro ?? 'Falha ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarTipger(tipger: '1' | '2') {
    setSalvando(true)
    setErroConfig(null)
    try {
      setConfig(await cartaCorrecaoApi.salvarConfig({ tipger }))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { erro?: string } } }
      setErroConfig(err.response?.data?.erro ?? 'Falha ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2"><IconeCaminhao /> Cartas de correção</h1>
          <p className="text-sm text-ink-muted">Transportadora, frete e volumes da NF corrigidos com CC-e gravada no Senior</p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Atualizar</button>
      </div>

      {/* Estado da configuração */}
      {config && (
        <div className={`rounded-xl border p-3 mb-4 text-sm ${config.modo === 'desligado'
          ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200'
          : 'border-surface-border bg-surface-card text-ink'}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>Modo: <strong>{MODO_LABEL[config.modo]}</strong></span>
            <span>Texto: <strong>{config.texto === 'livre' ? 'livre' : 'montado pelo sistema'}</strong></span>
            {config.dry_run && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                simulação (dry-run) — não chama o Senior
              </span>
            )}
            {!config.wsdl_carta_configurado && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                WSDL da carta não configurado
              </span>
            )}
            {config.modo === 'gravar_e_transmitir' && !config.wsdl_documento_configurado && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">
                WSDL do documento fiscal não configurado
              </span>
            )}
            {admin && (
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={config.modo}
                  disabled={salvando}
                  onChange={(e) => salvarModo(e.target.value as CceModo)}
                  className="bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[40px] text-sm"
                >
                  <option value="desligado">Desligado</option>
                  <option value="gravar">Só gravar</option>
                  <option value="gravar_e_transmitir">Gravar e transmitir</option>
                </select>
                <select
                  value={config.texto}
                  disabled={salvando}
                  onChange={(e) => salvarTexto(e.target.value as CceTexto)}
                  title="Montado: o sistema escreve 'ONDE SE LE X, LEIA-SE Y' e o usuário só complementa. Livre: o usuário digita o texto inteiro; transportadora, frete e volumes continuam sendo alterados na nota. As cartas anteriores são repetidas nos dois."
                  className="bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[40px] text-sm"
                >
                  <option value="montado">Texto montado pelo sistema</option>
                  <option value="livre">Texto livre</option>
                </select>
                {config.modo === 'gravar_e_transmitir' && (
                  <select
                    value={String(config.tipger)}
                    disabled={salvando}
                    onChange={(e) => salvarTipger(e.target.value as '1' | '2')}
                    title="tipGer do EmitirCartaCorrecao"
                    className="bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[40px] text-sm"
                  >
                    <option value="2">tipGer 2 — WS eDocs</option>
                    <option value="1">tipGer 1 — gerar XML</option>
                  </select>
                )}
              </div>
            )}
          </div>
          {erroConfig && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{erroConfig}</p>}
          {config.modo === 'gravar_e_transmitir' && !config.dry_run && (
            <p className="text-xs mt-2 text-red-700 dark:text-red-300">
              Transmitir registra o evento na SEFAZ em cima da nota real. Não tem volta. Avise o fiscal antes de usar.
            </p>
          )}
        </div>
      )}

      {/* Buscar NF */}
      <div className="bg-surface-card rounded-xl border border-surface-border p-4 mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Corrigir uma nota</label>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Número da NF, número do pedido ou cliente"
          className="w-full bg-surface-card border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
        />
        {busca.trim() && (
          <ul className="mt-2 divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden">
            {buscando && docs.length === 0 && <li className="p-3 text-xs text-ink-subtle">Buscando no Separa e no Senior…</li>}
            {!buscando && docs.length === 0 && (
              <li className="p-3 text-xs text-ink-subtle">{avisoBusca || 'Nenhum documento encontrado no Separa nem no Senior.'}</li>
            )}
            {!buscando && docs.length > 0 && avisoBusca && <li className="p-3 text-xs text-amber-700 dark:text-amber-400">{avisoBusca}</li>}
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{rotuloDocumento(d)}</span>
                    <DocBadges tipo={d.tipo} frete={d.frete} />
                    <span className="text-xs text-ink-subtle">{STATUS_LABEL[d.status] ?? d.status}</span>
                    {d.tipo === 'pedido' && !d.nf_numero && <span className="text-xs text-amber-700 dark:text-amber-400">sem NF ainda</span>}
                  </div>
                  <p className="text-sm text-ink-muted truncate">
                    {d.cliente || '—'}
                    <span className="text-ink-subtle"> · {d.transportadora || 'sem transportadora'}</span>
                  </p>
                </div>
                <button
                  onClick={() => setModalPedido(d.id)}
                  disabled={d.status === 'cancelado'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card text-ink text-xs font-medium hover:bg-surface-elev px-3 min-h-[40px] disabled:opacity-40"
                >
                  <IconeCaminhao /> Corrigir NF
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Histórico */}
      <div className="bg-surface-card rounded-xl border border-surface-border overflow-hidden">
        <div className="px-4 py-2 border-b border-surface-border bg-surface-elev/50 flex items-center gap-3 text-xs text-ink-muted font-medium">
          <span>Cartas feitas pelo Separa</span>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="ml-auto bg-surface-card border border-surface-border text-ink rounded-lg px-2 min-h-[32px] text-xs"
          >
            <option value="">Todas</option>
            <option value="gravada">Gravadas</option>
            <option value="transmitida">Transmitidas</option>
            <option value="erro_gravar">Erro ao gravar</option>
            <option value="erro_transmitir">Erro ao transmitir</option>
            <option value="simulada">Simuladas</option>
          </select>
        </div>
        {carregando ? (
          <p className="p-4 text-ink-muted">Carregando…</p>
        ) : cartas.length === 0 ? (
          <p className="p-8 text-ink-subtle text-center">Nenhuma carta ainda.</p>
        ) : (
          <ul>
            {cartas.map((c) => {
              const expandida = aberta === c.id
              return (
                <li key={c.id} className="border-b border-surface-border last:border-b-0">
                  <button onClick={() => setAberta(expandida ? null : c.id)} className="w-full text-left px-4 py-3 hover:bg-surface-elev/40">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{rotuloDocumento(c)}</span>
                      <ChipStatusCarta carta={c} />
                      <span className="text-xs text-ink-subtle">{fmt(c.criado_em)} · {c.usuario ?? '—'}</span>
                      <span className={`ml-auto text-ink-subtle text-sm transition-transform ${expandida ? 'rotate-90' : ''}`}>▸</span>
                    </div>
                    <p className="text-sm text-ink-muted truncate">
                      {c.cliente || '—'} · <strong className="text-ink">{resumoMudancas(c) || 'texto complementar'}</strong>
                    </p>
                    {c.erro && <p className="text-xs text-red-600 dark:text-red-400 truncate">{c.erro}</p>}
                  </button>
                  {expandida && (
                    <div className="px-4 pb-4 text-xs space-y-2">
                      <p className="font-mono whitespace-pre-wrap text-ink bg-surface-elev/50 rounded-lg p-2">{c.texto}</p>
                      {c.protocolo && <p className="text-ink-muted">Protocolo {c.protocolo}{c.autorizada_em ? ` · ${c.autorizada_em}` : ''}{c.sitdoe != null ? ` · sitDoe ${c.sitdoe}` : ''}</p>}
                      <details>
                        <summary className="cursor-pointer text-ink-muted">Rastro dos web services</summary>
                        <pre className="mt-1 bg-surface-elev/50 rounded-lg p-2 overflow-x-auto text-[11px] text-ink">
{JSON.stringify({
  gravar: { enviado: c.payload_gravar, retorno: c.retorno_gravar },
  transmitir: { enviado: c.payload_transmitir, retorno: c.retorno_transmitir },
}, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {modalPedido != null && (
        <ModalCarta
          pedidoId={modalPedido}
          onFechar={() => { setModalPedido(null); carregar() }}
          onAlterado={(p) => {
            // reflete transportadora/frete novos na lista da busca sem refazer a consulta
            setDocs((lista) => lista.map((d) => d.id === p.id
              ? { ...d, codtra: p.codtra, transportadora: p.transportadora, frete: p.frete, nf_numero: p.nf_numero }
              : d))
          }}
        />
      )}
    </div>
  )
}
