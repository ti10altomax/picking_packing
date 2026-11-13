'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
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
 */

/** Pedaços da lista colada, sem repetição. O servidor é quem separa número de lixo
 * ("NF:", "abc") e devolve o lixo em `invalidos`. */
export function separarNumeros(texto: string): string[] {
  return Array.from(new Set(texto.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean)))
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

/** Pendentes que vêm marcados: o próprio documento do número (`via` vazio); quando um número
 * só achou documentos "por tabela" (o pedido faturado nessa NF, a NF que saiu desse pedido),
 * esses. Pedido e NF dele não vêm os dois marcados — o servidor barraria o envio. */
function sugeridos(r: BuscaLote): Set<number> {
  const ids = new Set<number>()
  for (const res of r.resultados) {
    const pendentes = res.documentos.filter((d) => d.status === 'pendente')
    const diretos = pendentes.filter((d) => !d.via)
    for (const d of (diretos.length ? diretos : pendentes)) ids.add(d.id)
  }
  return ids
}

function rotulo(d: LinhaLote) {
  return `${d.tipo === 'nota_fiscal' ? 'NF' : 'Pedido'} ${d.numero_externo}`
}

// onEnviar devolve se deu certo (a tela de Vendas já mostra o toast); só então o modal fecha.
type Props = { onClose: () => void; onEnviar: (ids: number[]) => Promise<boolean> }

export function ListaNotasModal({ onClose, onEnviar }: Props) {
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

  const numeros = useMemo(() => separarNumeros(texto), [texto])
  const grupos = useMemo(() => (resultado ? agrupar(resultado) : null), [resultado])
  const pendentes = grupos?.docs.filter((d) => d.status === 'pendente') ?? []
  const outros = grupos?.docs.filter((d) => d.status !== 'pendente') ?? []

  async function abrirArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const conteudo = await f.text()
    setTexto((t) => (t.trim() ? `${t.trimEnd()}\n` : '') + conteudo)
    setResultado(null)
    e.target.value = ''
  }

  async function buscar() {
    if (!numeros.length || buscando) return
    setBuscando(true)
    setErro('')
    setResultado(null)
    try {
      const r = await supervisorApi.buscarLote(numeros)
      setResultado(r)
      setMarcados(sugeridos(r))
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">Vendas</p>
            <h2 className="text-lg font-semibold text-ink leading-tight">Colar lista de notas</h2>
            <p className="text-sm text-ink-muted">
              Cole os números separados por vírgula ou um por linha, ou abra o arquivo .txt. O que não estiver no Separa é buscado no Senior.
            </p>
          </div>
          <button onClick={onClose} className="text-ink-subtle hover:text-ink min-h-[44px] min-w-[44px] text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setResultado(null) }}
            placeholder={'151281, 151282, 151283\nou um por linha'}
            rows={resultado ? 3 : 7}
            spellCheck={false}
            className="w-full font-mono text-sm bg-surface-elev/40 border border-surface-border text-ink placeholder:text-ink-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-muted mr-auto">
              {numeros.length ? `${numeros.length} número(s)` : 'Nenhum número ainda'}
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
              disabled={!numeros.length || buscando}
              className="bg-orange-500 hover:bg-orange-400 text-white rounded-lg px-5 min-h-[44px] text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
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
                  Prontas para enviar <span className="text-ink-muted font-normal">· {pendentes.length}</span>
                </h3>
                {pendentes.length === 0 ? (
                  <p className="text-sm text-ink-subtle">Nenhum documento pendente nessa lista.</p>
                ) : (
                  <ul className="rounded-xl border border-surface-border overflow-hidden">
                    {pendentes.map((d) => {
                      const marcado = marcados.has(d.id)
                      return (
                        <li
                          key={d.id}
                          onClick={() => toggle(d.id)}
                          className={`flex items-center gap-3 px-3 py-2.5 border-b border-surface-border last:border-b-0 cursor-pointer ${marcado ? 'bg-orange-50 dark:bg-orange-500/10' : 'hover:bg-surface-elev/60'}`}
                        >
                          <input type="checkbox" checked={marcado} onChange={() => toggle(d.id)} onClick={(e) => e.stopPropagation()} className="w-5 h-5 accent-orange-500" />
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
                            {d.via && <p className="text-xs text-ink-subtle">{d.via} — envie só um dos dois</p>}
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
                    Já em outra etapa <span className="text-ink-muted font-normal">· {outros.length}</span>
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
                      : 'Não estão no Separa nem no Senior como nota fechada — confira o número; a nota pode não ter sido fechada ainda ou ter sido cancelada.'}
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

        <div className="px-5 py-3 border-t border-surface-border flex items-center justify-between gap-3">
          <span className="text-sm text-ink-muted">{resultado ? `${marcados.size} marcado(s)` : ''}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="text-sm text-ink-muted hover:text-ink px-3 min-h-[44px] transition-colors">
              Fechar
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={!marcados.size || enviando}
              className="bg-orange-500 hover:bg-orange-400 text-white px-5 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-50 shadow-lg shadow-orange-500/30 transition-all"
            >
              {enviando ? 'Enviando…' : marcados.size ? `Enviar ${marcados.size} para conferência` : 'Enviar para conferência'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
