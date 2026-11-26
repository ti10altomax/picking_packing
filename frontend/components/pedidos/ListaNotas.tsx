'use client'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supervisorApi, type BuscaLote, type LinhaLote } from '@/lib/api'
import { DocBadges } from '@/components/ui/DocBadges'
import { COR_STATUS, rotaDaLocalizacao } from '@/components/pedidos/OndeEsta'

/**
 * "Colar lista" da tela de Vendas (2026-11-13). O setor que fatura manda a relação das NFs
 * (outro sistema, e-mail, .txt) e a pessoa procurava uma a uma na busca. Aqui ela cola a
 * lista inteira — separada por vírgula, ponto e vírgula, espaço ou uma por linha — ou abre
 * o .txt; o servidor acha cada número no Separa e, se não está aqui, traz do Senior na
 * hora (`POST /api/pedidos/buscar_lote/`). O que está Pendente já vem marcado para enviar.
 *
 * Desde 2026-11-16 o mesmo modal serve o Pátio (`modo="patio"`): a lista vira sequência.
 * Lá só vale o que já está no Separa (Selecionado sem sequência vem marcado); o servidor
 * não vai ao Senior. E "151281-151290" vira o intervalo inteiro, nos dois modos.
 */

/** Quantos números o servidor aceita por busca (LOTE_MAX no backend). */
export const LOTE_MAX = 500

export type ListaAnalisada = {
  numeros: string[]
  /** Intervalos "a-b" maiores que LOTE_MAX, deixados de fora (erro de digitação quase sempre). */
  intervalosGrandes: string[]
}

/** Pedaços da lista colada, sem repetição. "151281-151290" (com ou sem espaços ao redor do
 * traço) vira os dez números; vírgula, ponto e vírgula, espaço e quebra de linha separam.
 * O servidor é quem separa número de lixo ("NF:", "abc") e devolve o lixo em `invalidos`. */
export function analisarLista(texto: string): ListaAnalisada {
  const vistos = new Set<string>()
  const intervalosGrandes: string[] = []
  // "151281 - 151290" → "151281-151290" antes de separar (senão o traço vira um pedaço solto)
  const normalizado = texto.replace(/(\d)\s*[-–—]\s*(\d)/g, '$1-$2')
  for (const pedaco of normalizado.split(/[\s,;]+/)) {
    const t = pedaco.trim()
    if (!t) continue
    const m = /^(\d+)-(\d+)$/.exec(t)
    if (!m) {
      vistos.add(t)
      continue
    }
    let a = Number(m[1]), b = Number(m[2])
    if (a > b) [a, b] = [b, a]
    if (b - a + 1 > LOTE_MAX) {
      intervalosGrandes.push(t)
      continue
    }
    for (let n = a; n <= b; n++) vistos.add(String(n))
  }
  return { numeros: Array.from(vistos), intervalosGrandes }
}

export function separarNumeros(texto: string): string[] {
  return analisarLista(texto).numeros
}

// 'consulta' (2026-11-26): a lista colada vira FILTRO da tela (Conferidos, Embarcados, Não
// conformes, Fechamentos, Cancelados, Etiquetas, sequência). Não envia nada a lugar nenhum.
export type ModoLista = 'vendas' | 'patio' | 'consulta'

/** Diz se o documento aparece na tela que abriu o modal (modo consulta). */
export type NaTela = (d: LinhaLote) => boolean

/** O que já pode ir: Vendas envia Pendente; Pátio sequencia Selecionado ainda sem sequência;
 * na consulta, o que está na tela. */
function pronto(d: LinhaLote, modo: ModoLista, naTela?: NaTela): boolean {
  if (modo === 'consulta') return naTela ? naTela(d) : true
  return modo === 'vendas' ? d.status === 'pendente' : d.status === 'selecionado' && !d.sequencia
}

const TEXTOS: Record<ModoLista, {
  setor: string; descricao: string; prontas: string; nenhuma: string; enviar: (n: number) => string
  naoEncontradas: string; cor: string; corFraca: string; sombra: string; accent: string
}> = {
  vendas: {
    setor: 'Vendas',
    descricao: 'Cole os números separados por vírgula ou um por linha, ou abra o arquivo .txt. Um intervalo como 151281-151290 vale pelos dez números. O que não estiver no Separa é buscado no Senior.',
    prontas: 'Prontas para enviar',
    nenhuma: 'Nenhum documento pendente nessa lista.',
    enviar: (n) => n ? `Enviar ${n} para conferência` : 'Enviar para conferência',
    naoEncontradas: 'Não estão no Separa nem no Senior como nota fechada — confira o número; a nota pode não ter sido fechada ainda ou ter sido cancelada.',
    cor: 'bg-orange-500 hover:bg-orange-400', corFraca: 'bg-orange-50 dark:bg-orange-500/10', sombra: 'shadow-orange-500/30', accent: 'accent-orange-500',
  },
  patio: {
    setor: 'Pátio',
    descricao: 'Cole os números separados por vírgula ou um por linha, ou abra o arquivo .txt. Um intervalo como 151281-151290 vale pelos dez números. O que está aguardando sequência já vem marcado.',
    prontas: 'Prontas para a sequência',
    nenhuma: 'Nenhum documento aguardando sequência nessa lista.',
    enviar: (n) => n ? `Enviar ${n} para a sequência` : 'Enviar para a sequência',
    naoEncontradas: 'Não estão no Separa. Se a nota ainda não foi enviada por Vendas, peça lá — o Pátio só sequencia o que já foi selecionado.',
    cor: 'bg-amber-500 hover:bg-amber-400', corFraca: 'bg-amber-50 dark:bg-amber-500/10', sombra: 'shadow-amber-500/30', accent: 'accent-amber-500',
  },
  consulta: {
    setor: 'Consulta',
    descricao: 'Cole os números separados por vírgula ou um por linha, ou abra o arquivo .txt. Um intervalo como 151281-151290 vale pelos dez números. A tela passa a mostrar só as notas da lista que estão nela.',
    prontas: 'Nesta tela',
    nenhuma: 'Nenhuma nota da lista está nesta tela.',
    enviar: (n) => n ? `Mostrar ${n} na tela` : 'Mostrar na tela',
    naoEncontradas: 'Não estão no Separa. Confira o número; a nota pode não ter sido importada ainda.',
    cor: 'bg-blue-600 hover:bg-blue-500', corFraca: 'bg-blue-50 dark:bg-blue-500/10', sombra: 'shadow-blue-500/30', accent: 'accent-blue-600',
  },
}

type Origem = BuscaLote['resultados'][number]['origem']
type Doc = LinhaLote & { numeros: string[]; origem: Origem }

/** Junta os documentos de todos os números (o mesmo documento pode responder por dois). */
function agrupar(r: BuscaLote): { docs: Doc[]; semDocumento: string[] } {
  const porId = new Map<number, Doc>()
  const semDocumento: string[] = []
  for (const res of r.resultados) {
    if (!res.documentos.length) semDocumento.push(res.numero)
    for (const d of res.documentos) {
      const atual = porId.get(d.id)
      if (atual) {
        atual.numeros.push(res.numero)
        if (res.origem === 'senior') atual.origem = 'senior'
      } else {
        porId.set(d.id, { ...d, numeros: [res.numero], origem: res.origem })
      }
    }
  }
  return { docs: Array.from(porId.values()), semDocumento }
}

/** Prontos que vêm marcados: o próprio documento do número (`via` vazio); quando um número
 * só achou documentos "por tabela" (o pedido faturado nessa NF, a NF que saiu desse pedido),
 * esses. Pedido e NF dele não vêm os dois marcados — o servidor barraria o envio. */
function sugeridos(r: BuscaLote, modo: ModoLista, naTela?: NaTela): Set<number> {
  const ids = new Set<number>()
  for (const res of r.resultados) {
    const prontos = res.documentos.filter((d) => pronto(d, modo, naTela))
    if (modo === 'consulta') {   // filtro: tudo o que está na tela, sem escolher entre pedido e NF
      for (const d of prontos) ids.add(d.id)
      continue
    }
    const diretos = prontos.filter((d) => !d.via)
    for (const d of (diretos.length ? diretos : prontos)) ids.add(d.id)
  }
  return ids
}

function rotulo(d: LinhaLote) {
  return `${d.tipo === 'nota_fiscal' ? 'NF' : 'Pedido'} ${d.numero_externo}`
}

// onEnviar devolve se deu certo (a tela já mostra o toast); só então o modal fecha.
// `rodape`: o Pátio põe aqui o seletor "Nova sequência / Sequência N".
// `naTela` + `nomeTela` (modo consulta): quais documentos pertencem à tela que abriu o modal.
type Props = {
  onClose: () => void
  onEnviar: (ids: number[]) => Promise<boolean>
  modo?: ModoLista
  rodape?: ReactNode
  naTela?: NaTela
  nomeTela?: string
}

export function ListaNotasModal({ onClose, onEnviar, modo = 'vendas', rodape, naTela, nomeTela }: Props) {
  const T = modo === 'consulta' && nomeTela ? { ...TEXTOS.consulta, setor: nomeTela } : TEXTOS[modo]
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState<BuscaLote | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const arquivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const { numeros, intervalosGrandes } = useMemo(() => analisarLista(texto), [texto])
  const excesso = numeros.length > LOTE_MAX
  const grupos = useMemo(() => (resultado ? agrupar(resultado) : null), [resultado])
  const pendentes = grupos?.docs.filter((d) => pronto(d, modo, naTela)) ?? []
  const outros = grupos?.docs.filter((d) => !pronto(d, modo, naTela)) ?? []

  async function abrirArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const conteudo = await f.text()
    setTexto((t) => (t.trim() ? `${t.trimEnd()}\n` : '') + conteudo)
    setResultado(null)
    e.target.value = ''
  }

  async function buscar() {
    if (!numeros.length || excesso || buscando) return
    setBuscando(true)
    setErro('')
    setResultado(null)
    try {
      const r = await supervisorApi.buscarLote(numeros, modo)
      setResultado(r)
      setMarcados(sugeridos(r, modo, naTela))
    } catch (e) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg || 'Não foi possível buscar a lista. Tente de novo.')
    } finally {
      setBuscando(false)
    }
  }

  function toggle(id: number) {
    setMarcados((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function enviar() {
    if (!marcados.size || enviando) return
    setEnviando(true)
    try {
      if (await onEnviar(Array.from(marcados))) onClose()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-surface-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{T.setor}</p>
            <h2 className="text-lg font-semibold text-ink leading-tight">Colar lista de notas</h2>
            <p className="text-sm text-ink-muted">{T.descricao}</p>
          </div>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink min-h-[44px] min-w-[44px] text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
            placeholder={'151281, 151282, 151283\n151290-151299\nou um por linha'}
            rows={resultado ? 3 : 7}
            spellCheck={false}
            className="w-full font-mono text-sm bg-surface-elev/40 border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm mr-auto ${excesso ? 'text-red-600 dark:text-red-400 font-medium' : 'text-ink-muted'}`}>
              {numeros.length ? `${numeros.length} número(s)` : 'Nenhum número ainda'}
              {excesso && ` — no máximo ${LOTE_MAX} por vez, reduza a lista`}
            </span>
            <input ref={arquivoRef} type="file" accept=".txt,.csv,text/plain" className="hidden" onChange={abrirArquivo} />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              className="bg-surface-card hover:bg-surface-elev border border-surface-border text-ink rounded-lg px-4 min-h-[44px] text-sm font-medium transition-colors"
            >
              Abrir arquivo .txt
            </button>
            <button
              type="button"
              onClick={buscar}
              disabled={!numeros.length || excesso || buscando}
              className={`${T.cor} text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold disabled:opacity-50 transition-colors`}
            >
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {intervalosGrandes.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Intervalo grande demais, ignorado (mais de {LOTE_MAX} números): <span className="font-mono">{intervalosGrandes.join(', ')}</span>. Confira os números.
            </p>
          )}
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          {resultado && grupos && (
            <div className="space-y-4">
              {resultado.senior_falhou && (
                <p className="rounded-xl border-2 border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                  O Senior não respondeu — os números que não estão no Separa não puderam ser consultados lá. Toque em "Buscar" de novo daqui a pouco.
                </p>
              )}

              <section>
                <h3 className="text-sm font-semibold text-ink mb-1.5">
                  {T.prontas} <span className="text-ink-muted font-normal">· {pendentes.length}</span>
                </h3>
                {pendentes.length === 0 ? (
                  <p className="text-sm text-ink-subtle">{T.nenhuma}</p>
                ) : (
                  <ul className="rounded-xl border border-surface-border overflow-hidden">
                    {pendentes.map((d) => {
                      const marcado = marcados.has(d.id)
                      return (
                        <li
                          key={d.id}
                          onClick={() => toggle(d.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 border-b border-surface-border last:border-b-0 cursor-pointer ${marcado ? T.corFraca : 'hover:bg-surface-elev/60'}`}
                        >
                          <input type="checkbox" checked={marcado} onChange={() => toggle(d.id)} onClick={(e) => e.stopPropagation()} className={`w-5 h-5 ${T.accent}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-ink">{rotulo(d)}</span>
                              <DocBadges tipo={d.tipo} frete={d.frete} origem={d.pedidos_origem} />
                              {d.origem === 'senior' && (
                                <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 px-2 py-0.5 text-[11px] font-bold">
                                  trazida do Senior agora
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-ink-muted truncate">{d.cliente || '—'}</p>
                            <p className={`text-xs truncate ${d.transportadora ? 'text-ink-muted' : 'text-amber-600 dark:text-amber-400'}`}>
                              {d.transportadora ? `🚚 ${d.transportadora}` : 'Sem transportadora'}
                            </p>
                            {d.via && <p className="text-xs text-ink-subtle">{d.via}{modo === 'consulta' ? '' : ' — envie só um dos dois'}</p>}
                          </div>
                          <span className="text-xs text-ink-muted whitespace-nowrap">{d.qtd_itens} {d.qtd_itens === 1 ? 'item' : 'itens'}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {outros.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-1.5">
                    {modo === 'consulta' ? 'Em outra tela' : 'Já em outra etapa'} <span className="text-ink-muted font-normal">· {outros.length}</span>
                  </h3>
                  <ul className="space-y-1.5">
                    {outros.map((d) => {
                      const rota = rotaDaLocalizacao(d)
                      return (
                        <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-elev/40 border border-surface-border px-3 py-2">
                          <span className="font-mono font-bold text-ink">{rotulo(d)}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${COR_STATUS[d.status] ?? COR_STATUS.pendente}`}>{d.status_label}</span>
                          <span className="text-sm text-ink-muted min-w-0 flex-1 basis-48">
                            {d.descricao}
                            {d.via && <span className="block text-xs text-ink-subtle">{d.via}</span>}
                          </span>
                          {rota && (
                            <Link href={rota} className="ml-auto inline-flex min-h-[36px] items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500">
                              Ver
                            </Link>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {grupos.semDocumento.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-1">
                    Não encontradas <span className="text-ink-muted font-normal">· {grupos.semDocumento.length}</span>
                  </h3>
                  <p className="font-mono text-sm text-ink break-words">{grupos.semDocumento.join(', ')}</p>
                  <p className="text-xs text-ink-subtle mt-1">
                    {resultado.senior_falhou
                      ? 'Não estão no Separa; o Senior não pôde ser consultado.'
                      : T.naoEncontradas}
                  </p>
                </section>
              )}

              {resultado.invalidos.length > 0 && (
                <p className="text-xs text-ink-subtle">
                  Ignorado (não é número): <span className="font-mono">{resultado.invalidos.join(', ')}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-surface-border flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink-muted">{resultado ? `${marcados.size} marcado(s)` : ''}</span>
            {resultado && marcados.size > 0 && rodape}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:text-ink px-3 min-h-[44px] transition-colors">
              Fechar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={!marcados.size || enviando}
              className={`${T.cor} text-white px-5 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-50 shadow-lg ${T.sombra} transition-all`}
            >
              {enviando ? 'Enviando…' : T.enviar(marcados.size)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Filtro por lista colada (2026-11-26) — telas de consulta: Conferidos, Embarcados, Não
// conformes, Fechamentos, Cancelados, Etiquetas e a tela da sequência. A tela guarda os ids
// (`number[] | null`) e mostra só eles; listas paginadas mandam `?ids=` ao servidor, as que
// já recebem tudo filtram no navegador.
// -----------------------------------------------------------------------------

/** Botão "Colar lista" do cabeçalho: abre o modal em modo consulta e devolve os ids escolhidos. */
export function ColarListaBotao({ nomeTela, naTela, onFiltrar }: {
  nomeTela: string
  naTela: NaTela
  onFiltrar: (ids: number[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="bg-surface-card hover:bg-surface-elev border border-surface-border text-ink rounded-lg px-4 min-h-[44px] text-sm font-medium transition-colors whitespace-nowrap"
        title="Colar a relação de notas (ou abrir um .txt) e mostrar só elas nesta tela"
      >
        Colar lista
      </button>
      {aberto && (
        <ListaNotasModal
          modo="consulta"
          nomeTela={nomeTela}
          naTela={naTela}
          onClose={() => setAberto(false)}
          onEnviar={async (ids) => { onFiltrar(ids); return true }}
        />
      )}
    </>
  )
}

/** Faixa acima da lista enquanto o filtro está ligado. `mostrando` = quantas a tela exibe agora
 * (pode ser menos que a lista: paginação, ou a nota mudou de etapa). */
export function FaixaListaColada({ ids, mostrando, onLimpar }: {
  ids: number[] | null
  mostrando?: number
  onLimpar: () => void
}) {
  if (!ids) return null
  return (
    <div className="mb-3 flex items-center gap-3 flex-wrap rounded-xl border border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10 px-3 py-2 text-sm text-blue-900 dark:text-blue-200 print:hidden">
      <span className="mr-auto">
        Mostrando só a <strong>lista colada</strong>: {ids.length} nota{ids.length === 1 ? '' : 's'}
        {mostrando !== undefined && mostrando !== ids.length && <> · {mostrando} na tela agora</>}
      </span>
      <button
        type="button"
        onClick={onLimpar}
        className="rounded-lg border border-blue-300 dark:border-blue-500/40 px-3 min-h-[36px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
      >
        Limpar filtro
      </button>
    </div>
  )
}
