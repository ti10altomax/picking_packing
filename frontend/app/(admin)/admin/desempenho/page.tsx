'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { desempenhoApi, type DesempenhoDia, type DesempenhoAcao, type DesempenhoHora } from '@/lib/api'

/**
 * Admin → Desempenho (2026-11-26).
 *
 * O dia em números: quanto se trabalhou (bips, OPs, conferências — vem do histórico dos
 * documentos, vale para qualquer data) e quão rápido o servidor respondeu (tempos resumidos a
 * cada 5 minutos pelo próprio servidor — só existem a partir do deploy desta tela). Substitui a
 * análise manual do log de requisições, que se perdia a cada deploy.
 */

function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Milissegundos → "0,09 s" (ou "—") */
function seg(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '—'
  const casas = ms >= 10000 ? 1 : 2   // 14,3 s · 0,09 s (mínimo e máximo iguais: o contrário dá RangeError)
  return `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} s`
}

function num(n: number | null | undefined) {
  return n === null || n === undefined ? '—' : n.toLocaleString('pt-BR')
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function horaSeg(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Cor do tempo: verde até 0,3 s, âmbar até 1 s, vermelho acima */
function corTempo(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return 'text-ink-subtle'
  if (ms <= 300) return 'text-emerald-700 dark:text-emerald-300'
  if (ms <= 1000) return 'text-amber-700 dark:text-amber-300'
  return 'text-red-700 dark:text-red-300'
}

export default function DesempenhoPage() {
  const [data, setData] = useState(hojeIso())
  const [dados, setDados] = useState<DesempenhoDia | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (dia: string) => {
    setCarregando(true)
    setErro('')
    try {
      setDados(await desempenhoApi.dia(dia))
    } catch {
      setErro('Não foi possível ler os dados deste dia.')
      setDados(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar(data) }, [data, carregar])

  const r = dados?.resumo
  const ehHoje = data === hojeIso()

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 print:mb-2">
        <div>
          <h1 className="text-xl font-bold">Desempenho</h1>
          <p className="text-sm text-ink-muted">
            Quanto se trabalhou e quão rápido o sistema respondeu, dia a dia ·{' '}
            <Link href="/admin/saude" className="underline underline-offset-2 hover:text-ink print:hidden">saúde do sistema</Link>
          </p>
        </div>
        <div className="flex items-center gap-1 print:hidden">
          <button onClick={() => setData(somarDias(data, -1))} className="min-h-[44px] px-3 rounded-lg border border-surface-border bg-surface-card text-ink hover:bg-surface-elev" aria-label="Dia anterior">←</button>
          <input
            type="date"
            value={data}
            max={hojeIso()}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="min-h-[44px] px-3 rounded-lg border border-surface-border bg-surface-card text-ink text-sm"
          />
          <button onClick={() => setData(somarDias(data, 1))} disabled={ehHoje} className="min-h-[44px] px-3 rounded-lg border border-surface-border bg-surface-card text-ink hover:bg-surface-elev disabled:opacity-40" aria-label="Dia seguinte">→</button>
          <button onClick={() => carregar(data)} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Atualizar</button>
          <button onClick={() => window.print()} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Imprimir</button>
        </div>
      </div>
      <p className="hidden print:block text-sm mb-2">Dia {data.split('-').reverse().join('/')}</p>

      {carregando && !dados ? (
        <p className="text-ink-muted">Carregando…</p>
      ) : erro ? (
        <p className="text-red-600 dark:text-red-400">{erro}</p>
      ) : dados && r ? (
        <div className={carregando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            <Cartao rotulo="Conferências concluídas" valor={num(r.conclusoes)} />
            <Cartao rotulo="Leituras de item (bips)" valor={num(r.bips)} detalhe={r.ops ? `+ ${num(r.ops)} OPs lidas` : undefined} />
            <Cartao rotulo="Conferentes que trabalharam" valor={num(r.conferentes)} />
            <Cartao rotulo="Tempo do bip (mediana)" valor={seg(r.bip_mediana_ms)} cor={corTempo(r.bip_mediana_ms)} detalhe={r.bip_p95_ms != null ? `95% em até ${seg(r.bip_p95_ms)}` : undefined} />
            <Cartao rotulo="Respostas em até 0,3 s" valor={r.ate_300_pct != null ? `${r.ate_300_pct.toLocaleString('pt-BR')}%` : '—'} detalhe={r.requisicoes ? `de ${num(r.requisicoes)} requisições` : undefined} />
            <Cartao rotulo="Erros de servidor" valor={dados.tem_tempos ? num(r.erros) : '—'} cor={r.erros ? 'text-red-700 dark:text-red-300' : undefined} detalhe={dados.tem_tempos ? `${num(r.acima_2000)} acima de 2 s` : undefined} />
          </div>

          {!dados.tem_tempos && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200 mb-4">
              Não há tempos de resposta guardados para este dia. A atividade (bips, OPs, conferências) vem do histórico dos documentos e aparece
              para qualquer data; os tempos passaram a ser guardados quando esta tela entrou em produção.
            </p>
          )}

          {/* Por hora */}
          <Secao titulo="Hora a hora" legenda="Barras: leituras de item. Linha: tempo mediano do bip no servidor. Embaixo, as conferências concluídas e quantos conferentes bipavam.">
            {dados.horas.length === 0 ? <Vazio>Nenhuma atividade neste dia.</Vazio> : <GraficoHoras horas={dados.horas} />}
          </Secao>

          {/* Ações do conferente */}
          <Secao titulo="O que o conferente faz" legenda="Tempo que o servidor levou para responder a cada ação. Não inclui a rede Wi-Fi nem o tempo do coletor para desenhar a tela.">
            {dados.acoes_conferente.length === 0 ? <Vazio>Sem tempos guardados.</Vazio> : <TabelaAcoes linhas={dados.acoes_conferente} />}
          </Secao>

          {/* Quem trabalhou */}
          <Secao titulo="Quem trabalhou">
            {dados.conferentes.length === 0 ? <Vazio>Ninguém conferiu neste dia.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                    <th className="py-2 pr-3 font-medium">Conferente</th><th className="py-2 px-3 font-medium text-right">Bips</th>
                    <th className="py-2 px-3 font-medium text-right">OPs</th><th className="py-2 px-3 font-medium text-right">Conclusões</th>
                    <th className="py-2 pl-3 font-medium text-right">Primeira e última ação</th>
                  </tr></thead>
                  <tbody>
                    {dados.conferentes.map((c) => (
                      <tr key={c.usuario} className="border-b border-surface-border last:border-b-0">
                        <td className="py-2 pr-3 font-semibold text-ink">{c.usuario}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{num(c.bips)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{num(c.ops)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{num(c.conclusoes)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums text-ink-muted">{hora(c.primeiro)} – {hora(c.ultimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          {/* Demais telas e carga de fundo */}
          <Secao titulo="Telas de gestão e carga de fundo" legenda="Ordenado pelo tempo total que o servidor gastou com cada tipo de chamada no dia.">
            {dados.demais.length === 0 ? <Vazio>Sem tempos guardados.</Vazio> : <TabelaAcoes linhas={dados.demais} comTotal />}
          </Secao>

          {/* Lentas */}
          <Secao
            titulo={`Requisições lentas${dados.lentas.length ? ` (${dados.lentas.length})` : ''}`}
            legenda={`Guardadas uma a uma: acima de ${seg(dados.limites_ms.lenta_conferente)} para o conferente e de ${seg(dados.limites_ms.lenta)} para os demais. Da mais demorada para a menos.`}
          >
            {dados.lentas.length === 0 ? <Vazio>{dados.tem_tempos ? 'Nenhuma neste dia.' : 'Sem tempos guardados.'}</Vazio> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-ink-muted border-b border-surface-border">
                    <th className="py-2 pr-3 font-medium">Hora</th><th className="py-2 px-3 font-medium">O quê</th>
                    <th className="py-2 px-3 font-medium">Quem</th><th className="py-2 pl-3 font-medium text-right">Tempo</th>
                  </tr></thead>
                  <tbody>
                    {dados.lentas.map((l, i) => (
                      <tr key={i} className="border-b border-surface-border last:border-b-0">
                        <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{horaSeg(l.quando)}</td>
                        <td className="py-2 px-3">
                          <span className="text-ink">{l.rotulo}</span>
                          <span className="block text-xs text-ink-subtle font-mono break-all">{l.metodo} {l.caminho}{l.status_http >= 400 ? ` · ${l.status_http}` : ''}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{l.usuario ?? '—'}{l.perfil ? <span className="text-xs text-ink-subtle"> · {l.perfil}</span> : null}</td>
                        <td className={`py-2 pl-3 text-right tabular-nums font-semibold whitespace-nowrap ${corTempo(l.duracao_ms)}`}>{seg(l.duracao_ms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>

          {dados.tem_tempos && (
            <p className="text-xs text-ink-subtle mt-2">
              Mediana e 95% são estimados a partir de faixas de tempo (o servidor guarda um resumo a cada 5 minutos, não cada requisição);
              o pior caso é exato. Sem as consultas do agente de impressão: {num(r.requisicoes_sem_agente)} requisições,{' '}
              {r.ate_300_pct_sem_agente != null ? `${r.ate_300_pct_sem_agente.toLocaleString('pt-BR')}% em até 0,3 s` : '—'}.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Cartao({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl px-3 py-2.5">
      <p className="text-xs text-ink-muted leading-tight">{rotulo}</p>
      <p className={`text-2xl font-semibold tabular-nums leading-tight mt-1 ${cor ?? 'text-ink'}`}>{valor}</p>
      {detalhe && <p className="text-xs text-ink-subtle mt-0.5">{detalhe}</p>}
    </div>
  )
}

function Secao({ titulo, legenda, children }: { titulo: string; legenda?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-card border border-surface-border rounded-xl p-4 mb-4 break-inside-avoid">
      <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
      {legenda && <p className="text-xs text-ink-muted mb-3">{legenda}</p>}
      <div className={legenda ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-subtle py-4 text-center">{children}</p>
}

function TabelaAcoes({ linhas, comTotal = false }: { linhas: DesempenhoAcao[]; comTotal?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-muted border-b border-surface-border">
          <th className="py-2 pr-3 font-medium">Ação</th><th className="py-2 px-3 font-medium text-right">Quantas</th>
          <th className="py-2 px-3 font-medium text-right">Mediana</th><th className="py-2 px-3 font-medium text-right">95% em até</th>
          <th className="py-2 px-3 font-medium text-right">Pior caso</th>
          {comTotal && <th className="py-2 pl-3 font-medium text-right">Tempo somado</th>}
        </tr></thead>
        <tbody>
          {linhas.map((a) => (
            <tr key={a.acao} className="border-b border-surface-border last:border-b-0">
              <td className="py-2 pr-3 text-ink">{a.rotulo}</td>
              <td className="py-2 px-3 text-right tabular-nums">{num(a.n)}</td>
              <td className={`py-2 px-3 text-right tabular-nums font-semibold ${corTempo(a.mediana_ms)}`}>{seg(a.mediana_ms)}</td>
              <td className={`py-2 px-3 text-right tabular-nums ${corTempo(a.p95_ms)}`}>{seg(a.p95_ms)}</td>
              <td className={`py-2 px-3 text-right tabular-nums ${corTempo(a.max_ms)}`}>{seg(a.max_ms)}</td>
              {comTotal && <td className="py-2 pl-3 text-right tabular-nums text-ink-muted">{a.soma_min.toLocaleString('pt-BR')} min</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Barras (bips por hora) + linha (mediana do bip) em SVG, sem biblioteca. */
function GraficoHoras({ horas }: { horas: DesempenhoHora[] }) {
  const L = 760, A = 250, margem = { e: 44, d: 52, t: 14, b: 62 }
  const larg = L - margem.e - margem.d, alt = A - margem.t - margem.b
  const maxBips = Math.max(10, ...horas.map((h) => h.bips))
  const tempos = horas.map((h) => h.bip_mediana_ms).filter((v): v is number => v != null)
  const maxMs = Math.max(200, ...tempos) * 1.15
  const passo = larg / horas.length
  const barra = Math.min(46, passo * 0.62)
  const x = (i: number) => margem.e + passo * i + passo / 2
  const yBips = (v: number) => margem.t + alt - (v / maxBips) * alt
  const yMs = (v: number) => margem.t + alt - (v / maxMs) * alt
  const pontos = horas.map((h, i) => (h.bip_mediana_ms != null ? `${x(i)},${yMs(h.bip_mediana_ms)}` : null)).filter(Boolean).join(' ')

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full min-w-[560px] max-w-[920px]" role="img" aria-label="Leituras de item e tempo do bip por hora">
        {/* grade e eixo dos bips */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={margem.e} x2={L - margem.d} y1={margem.t + alt * (1 - f)} y2={margem.t + alt * (1 - f)} className="stroke-surface-border" strokeWidth="1" />
            <text x={margem.e - 6} y={margem.t + alt * (1 - f) + 4} textAnchor="end" className="fill-ink-subtle" fontSize="11">{Math.round(maxBips * f)}</text>
            {tempos.length > 0 && (
              <text x={L - margem.d + 6} y={margem.t + alt * (1 - f) + 4} className="fill-amber-600 dark:fill-amber-400" fontSize="11">{Math.round(maxMs * f)} ms</text>
            )}
          </g>
        ))}
        {horas.map((h, i) => (
          <g key={h.hora}>
            <rect x={x(i) - barra / 2} y={yBips(h.bips)} width={barra} height={margem.t + alt - yBips(h.bips)} rx="3" className="fill-blue-500/80" />
            <text x={x(i)} y={margem.t + alt + 16} textAnchor="middle" className="fill-ink" fontSize="12" fontWeight="600">{h.hora}h</text>
            <text x={x(i)} y={margem.t + alt + 32} textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-400" fontSize="11">{h.conclusoes} concl.</text>
            <text x={x(i)} y={margem.t + alt + 46} textAnchor="middle" className="fill-ink-subtle" fontSize="11">{h.conferentes_bipando} conf.{h.ops ? ` · ${h.ops} OP` : ''}</text>
          </g>
        ))}
        {pontos && <polyline points={pontos} fill="none" className="stroke-amber-500" strokeWidth="2.5" strokeLinejoin="round" />}
        {/* o número da barra vai por cima da linha, com contorno na cor do cartão para não embolar */}
        {horas.map((h, i) => h.bips > 0 && (
          <text
            key={`n${h.hora}`} x={x(i)} y={yBips(h.bips) - 4} textAnchor="middle" fontSize="11" fontWeight="600"
            className="fill-ink stroke-surface-card" strokeWidth="3" paintOrder="stroke"
          >
            {h.bips}
          </text>
        ))}
        {horas.map((h, i) => h.bip_mediana_ms != null && (
          <g key={`p${h.hora}`}>
            <circle cx={x(i)} cy={yMs(h.bip_mediana_ms)} r="3.5" className="fill-amber-500" />
            <title>{`${h.hora}h — bip: mediana ${h.bip_mediana_ms} ms, 95% em até ${h.bip_p95_ms} ms, pior ${h.bip_max_ms} ms`}</title>
          </g>
        ))}
      </svg>
      <p className="text-xs text-ink-subtle mt-1">
        <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/80 align-middle mr-1" />leituras de item
        <span className="inline-block w-4 h-0.5 bg-amber-500 align-middle ml-4 mr-1" />tempo mediano do bip (escala à direita)
      </p>
    </div>
  )
}
