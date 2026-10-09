'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { agoraApi, type AgoraPainel } from '@/lib/api'
import { HistoricoBotao } from '@/components/pedidos/HistoricoPedido'

/**
 * Agora no galpão (observabilidade, 2026-10-08) — o presente, para o supervisor.
 * Lê /api/agora/ a cada 15 s: quem está conferindo o quê, quem parou de bipar,
 * atribuídos parados, tamanho das filas, sequências abertas e ritmo do dia.
 */

const INTERVALO_MS = 15_000

function min(m: number | null): string {
  if (m === null) return '—'
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

function nomeDoc(tipo: string) {
  return tipo === 'nota_fiscal' ? 'NF' : 'Pedido'
}

export default function AgoraPage() {
  const [d, setD] = useState<AgoraPainel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [lidoEm, setLidoEm] = useState<Date | null>(null)
  const [segundos, setSegundos] = useState(0)

  const carregar = useCallback(async () => {
    try {
      setD(await agoraApi.painel())
      setErro(null)
      setLidoEm(new Date())
      setSegundos(0)
    } catch {
      setErro('Sem resposta da API.')
    }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, INTERVALO_MS)
    const s = setInterval(() => setSegundos((v) => v + 1), 1000)
    return () => { clearInterval(t); clearInterval(s) }
  }, [carregar])

  const f = d?.filas
  const FILAS = f ? [
    { rotulo: 'Selecionados sem sequência', valor: f.selecionados_sem_sequencia, href: '/supervisor/patio', alerta: f.selecionados_sem_sequencia > 0 ? 'amber' : '' },
    { rotulo: 'Atribuídos sem iniciar', valor: f.atribuidos, href: '/supervisor/patio', sub: f.atribuido_mais_antigo_min !== null ? `mais antigo há ${min(f.atribuido_mais_antigo_min)}` : undefined, alerta: (f.atribuido_mais_antigo_min ?? 0) >= d!.sem_iniciar_apos_min ? 'red' : '' },
    { rotulo: 'Em conferência', valor: f.em_conferencia, href: '/supervisor/patio' },
    { rotulo: 'Aguardando fechamento', valor: f.aguardando_fechamento, href: '/supervisor/fechamentos', alerta: f.aguardando_fechamento > 0 ? 'violet' : '' },
    { rotulo: 'Não conformes', valor: f.nao_conformes, href: '/supervisor/nao-conformes', alerta: f.nao_conformes > 0 ? 'red' : '' },
    { rotulo: 'Cancelados a transferir', valor: f.cancelados_a_transferir, href: '/supervisor/cancelados', alerta: f.cancelados_a_transferir > 0 ? 'red' : '' },
    { rotulo: 'Etiquetas prontas', valor: f.etiquetas_prontas, href: '/supervisor/etiquetas', sub: f.etiquetas_aguardando_transportadora > 0 ? `${f.etiquetas_aguardando_transportadora} aguardando transportadora` : undefined, alerta: f.etiquetas_prontas > 0 ? 'emerald' : '' },
    { rotulo: 'Conferidos hoje', valor: f.conferidos_hoje, href: '/supervisor/conferidos', sub: `${f.conferidos_1h} na última hora` },
  ] : []

  const ALERTA: Record<string, string> = {
    amber: 'border-amber-300 dark:border-amber-500/40',
    red: 'border-red-300 dark:border-red-500/40',
    violet: 'border-violet-300 dark:border-violet-500/40',
    emerald: 'border-emerald-300 dark:border-emerald-500/40',
    '': 'border-surface-border',
  }

  const maxBips = Math.max(1, ...(d?.por_hora.map((h) => h.bips) ?? [1]))
  const maxConf = Math.max(1, ...(d?.por_hora.map((h) => h.conferidos) ?? [1]))

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Agora no galpão</h1>
          <p className="text-sm text-ink-muted">
            Quem está fazendo o quê · atualiza a cada 15 s
            {lidoEm && <> · lido há {segundos} s</>}
          </p>
        </div>
        <button onClick={carregar} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Atualizar</button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{erro}</p>}
      {!d && !erro && <p className="text-ink-muted">Carregando…</p>}

      {d && (
        <>
          {/* Conferentes */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">
            Conferentes em ação
            <span className="ml-2 font-normal normal-case tracking-normal text-ink-subtle">
              {d.filas.bips_1h} bips na última hora
            </span>
          </h2>
          {d.conferentes.length === 0 ? (
            <p className="text-sm text-ink-subtle mb-8">Ninguém com documento na mão agora.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
              {d.conferentes.map((c) => {
                const p = c.em_conferencia
                const pct = p && p.qtd_pedida > 0 ? Math.min(100, Math.round((p.qtd_separada / p.qtd_pedida) * 100)) : 0
                return (
                  <div
                    key={c.conferente}
                    className={`bg-surface-card rounded-xl border p-4 ${c.parado ? 'border-red-300 dark:border-red-500/40' : 'border-surface-border'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{c.conferente}</span>
                      <span className="text-xs text-ink-subtle tabular-nums">{c.bips_1h} bips/h · {c.conferidos_hoje} hoje</span>
                    </div>
                    {p ? (
                      <>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink">{nomeDoc(p.tipo)} {p.numero_externo}</span>
                          {p.sequencia && <span className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">seq. {p.sequencia}</span>}
                          {c.parado && (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 px-2 py-0.5 rounded animate-pulse">
                              sem bip há {min(p.sem_bip_min)}
                            </span>
                          )}
                          <HistoricoBotao pedidoId={p.id} className="ml-auto" />
                        </div>
                        <p className="text-sm text-ink-muted truncate">{p.cliente || '—'}{p.separado_por && <> · separado por {p.separado_por}</>}</p>
                        <div className="mt-2 h-2 rounded-full bg-surface-elev overflow-hidden">
                          <div className={`h-full ${c.parado ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-xs text-ink-subtle mt-1 tabular-nums">
                          {p.qtd_separada}/{p.qtd_pedida} unidades · começou há {min(p.ha_min)}
                          {p.ultimo_bip_em && <> · último bip há {min(p.sem_bip_min)}</>}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-ink-muted mt-2">Sem documento aberto</p>
                    )}
                    {c.atribuidos > 0 && (
                      <p className="text-xs text-ink-subtle mt-1">+ {c.atribuidos} atribuído(s) na fila dele</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Atribuídos sem iniciar */}
          {d.sem_iniciar.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 mb-8">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Atribuídos há mais de {d.sem_iniciar_apos_min} min sem iniciar
              </p>
              <ul className="mt-2 space-y-1">
                {d.sem_iniciar.map((p) => (
                  <li key={p.id} className="text-sm text-ink flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{nomeDoc(p.tipo)} {p.numero_externo}</span>
                    <span className="text-ink-muted">{p.conferente ?? 'sem conferente'}{p.sequencia && <> · seq. {p.sequencia}</>} · há {min(p.ha_min)}</span>
                    <HistoricoBotao pedidoId={p.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filas */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Filas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {FILAS.map((x) => (
              <Link key={x.rotulo} href={x.href} className={`bg-surface-card rounded-xl border p-4 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 transition-all ${ALERTA[x.alerta ?? '']}`}>
                <p className="font-display text-3xl font-semibold leading-none text-ink tabular-nums">{x.valor}</p>
                <p className="text-sm text-ink mt-2 leading-snug">{x.rotulo}</p>
                {x.sub && <p className="text-xs text-ink-subtle mt-0.5">{x.sub}</p>}
              </Link>
            ))}
          </div>

          {/* Sequências */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Sequências abertas</h2>
          {d.sequencias.length === 0 ? (
            <p className="text-sm text-ink-subtle mb-8">Nenhuma sequência aberta.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
              {d.sequencias.map((s) => (
                <Link key={s.id} href={`/supervisor/patio/sequencia/${s.id}`} className="bg-surface-card rounded-xl border border-surface-border p-4 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 transition-all">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">Sequência {s.numero}</span>
                    <span className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">{s.status === 'aberta' ? 'aberta' : 'em andamento'}</span>
                  </div>
                  <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-surface-elev">
                    {s.total > 0 && (
                      <>
                        <div className="bg-emerald-500" style={{ width: `${(s.finalizados / s.total) * 100}%` }} />
                        <div className="bg-blue-500" style={{ width: `${(s.em_conferencia / s.total) * 100}%` }} />
                        <div className="bg-amber-400" style={{ width: `${(s.atribuidos / s.total) * 100}%` }} />
                      </>
                    )}
                  </div>
                  <p className="text-xs text-ink-subtle mt-1 tabular-nums">
                    {s.finalizados} finalizados · {s.em_conferencia} em conferência · {s.atribuidos} atribuídos · {s.selecionados} a atribuir
                    {s.outros > 0 && <> · {s.outros} outros</>} · {s.total} no total
                  </p>
                  {s.conferentes.length > 0 && <p className="text-xs text-ink-muted mt-1">{s.conferentes.join(', ')}</p>}
                </Link>
              ))}
            </div>
          )}

          {/* Ritmo do dia */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">
            Ritmo de hoje
            <span className="ml-2 font-normal normal-case tracking-normal text-ink-subtle">
              {d.filas.bips_hoje} bips · {d.filas.conferidos_hoje} conferidos · {d.filas.divergencias_hoje} códigos divergentes · {d.filas.cancelados_hoje} cancelados
            </span>
          </h2>
          <div className="bg-surface-card rounded-xl border border-surface-border p-4 mb-8">
            <div className="flex items-end gap-1 h-28">
              {d.por_hora.map((h) => (
                <div key={h.hora} className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-0" title={`${h.hora}: ${h.bips} bips, ${h.conferidos} conferidos`}>
                  <div className="w-full flex items-end gap-px h-24">
                    <div className="flex-1 bg-emerald-500/70 rounded-t" style={{ height: `${(h.bips / maxBips) * 100}%` }} />
                    <div className="flex-1 bg-blue-500/70 rounded-t" style={{ height: `${(h.conferidos / maxConf) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-ink-subtle">{h.hora}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-subtle mt-2"><span className="inline-block w-2 h-2 bg-emerald-500/70 rounded-sm mr-1" />bips <span className="inline-block w-2 h-2 bg-blue-500/70 rounded-sm ml-3 mr-1" />conferidos</p>
          </div>
        </>
      )}
    </div>
  )
}
