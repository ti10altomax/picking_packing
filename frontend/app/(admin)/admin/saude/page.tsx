'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { errosClienteApi, saudeApi, type ErroClienteItem, type SaudeSistema, type StatusSaude, type TarefaSaude } from '@/lib/api'

/**
 * Admin → Saúde (observabilidade, 2026-10-08).
 *
 * Lê /api/saude/: componentes (Postgres, Redis, worker Celery, Oracle do
 * Senior, agentes USB) e o heartbeat das tarefas periódicas (ExecucaoTarefa).
 * Atualiza sozinha a cada 30 s. É a resposta para "o sync está rodando?"
 * sem abrir `docker logs` na VM.
 */

const COR: Record<StatusSaude, { ponto: string; texto: string; fundo: string; rotulo: string }> = {
  ok: {
    ponto: 'bg-emerald-500',
    texto: 'text-emerald-700 dark:text-emerald-300',
    fundo: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    rotulo: 'Tudo certo',
  },
  atencao: {
    ponto: 'bg-amber-500',
    texto: 'text-amber-700 dark:text-amber-300',
    fundo: 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30',
    rotulo: 'Atenção',
  },
  erro: {
    ponto: 'bg-red-500',
    texto: 'text-red-700 dark:text-red-300',
    fundo: 'bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30',
    rotulo: 'Problema',
  },
}

function ha(segundos: number | null): string {
  if (segundos === null) return 'nunca'
  if (segundos < 60) return `há ${segundos} s`
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`
  if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} h`
  return `há ${Math.floor(segundos / 86400)} d`
}

function intervalo(s: number | null): string {
  if (!s) return 'sob demanda'
  return s < 60 ? `a cada ${s} s` : `a cada ${Math.round(s / 60)} min`
}

function fmtHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function resumoResultado(r: unknown): string {
  if (!r || typeof r !== 'object') return ''
  const partes: string[] = []
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const sub = Object.entries(v as Record<string, unknown>).map(([a, b]) => `${a} ${b}`).join(', ')
      partes.push(`${k}: ${sub}`)
    } else {
      partes.push(`${k} ${v}`)
    }
  }
  return partes.join(' · ')
}

function statusTarefa(t: TarefaSaude): StatusSaude {
  if (t.atrasada) return 'erro'
  if (t.ultimo_status === 'erro') return 'atencao'
  return 'ok'
}

export default function SaudePage() {
  const [dados, setDados] = useState<SaudeSistema | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const [erros, setErros] = useState<ErroClienteItem[]>([])
  const [horasErros, setHorasErros] = useState(24)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [s, e] = await Promise.all([saudeApi.completa(), errosClienteApi.listar(horasErros)])
      setDados(s)
      setErros(e.erros)
      setErro(null)
      setAtualizadoEm(new Date())
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status
      setErro(status ? `A API respondeu ${status}.` : 'Sem resposta da API — o backend pode estar fora.')
    } finally {
      setCarregando(false)
    }
  }, [horasErros])

  useEffect(() => {
    carregar()
    const timer = setInterval(carregar, 30_000)
    return () => clearInterval(timer)
  }, [carregar])

  const geral = erro ? 'erro' : dados?.status ?? 'ok'
  const cor = COR[geral]

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <Link href="/admin" className="text-xs text-ink-subtle hover:text-ink transition-colors">← Admin</Link>
          <h1 className="text-2xl font-semibold text-ink leading-tight mt-1">Saúde do sistema</h1>
          <p className="text-sm text-ink-muted mt-1">
            Componentes e tarefas periódicas · atualiza a cada 30 s
            {atualizadoEm && <> · última leitura {atualizadoEm.toLocaleTimeString('pt-BR')}</>}
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={carregando}
          className="text-xs border border-surface-border text-ink rounded-lg px-3 py-2 min-h-[44px] hover:bg-surface-elev disabled:opacity-50"
        >
          {carregando ? 'Lendo…' : 'Atualizar'}
        </button>
      </div>

      {/* Veredito */}
      <div className={`rounded-2xl border p-4 mb-6 ${cor.fundo}`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${cor.ponto} ${geral !== 'ok' ? 'animate-pulse' : ''}`} />
          <span className={`font-semibold ${cor.texto}`}>{cor.rotulo}</span>
        </div>
        {erro && <p className={`text-sm mt-2 ${cor.texto}`}>{erro}</p>}
        {dados && dados.problemas.length > 0 && (
          <ul className={`text-sm mt-2 space-y-0.5 ${cor.texto}`}>
            {dados.problemas.map((p) => <li key={p}>• {p}</li>)}
          </ul>
        )}
        {dados && dados.problemas.length === 0 && !erro && (
          <p className="text-sm mt-2 text-ink-muted">Banco, fila, worker, Oracle e tarefas respondendo normalmente.</p>
        )}
      </div>

      {dados && (
        <>
          {/* Componentes */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Componentes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {dados.componentes.map((c) => (
              <div key={c.chave} className="bg-surface-card rounded-xl border border-surface-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${COR[c.status].ponto}`} />
                    <span className="font-medium text-ink truncate">{c.nome}</span>
                  </div>
                  <span className="text-xs text-ink-subtle tabular-nums shrink-0">{c.latencia_ms} ms</span>
                </div>
                <p className={`text-sm mt-2 break-words ${c.status === 'ok' ? 'text-ink-muted' : COR[c.status].texto}`}>
                  {c.detalhe}
                </p>
                {!c.essencial && (
                  <p className="text-[11px] text-ink-subtle mt-1">não para a conferência se cair</p>
                )}
              </div>
            ))}
          </div>

          {/* Tarefas */}
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Tarefas (Celery)</h2>
          <div className="space-y-3 mb-8">
            {dados.tarefas.length === 0 && (
              <p className="text-sm text-ink-subtle">Nenhuma execução registrada ainda.</p>
            )}
            {dados.tarefas.map((t) => {
              const st = statusTarefa(t)
              return (
                <div key={t.tarefa} className="bg-surface-card rounded-xl border border-surface-border p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`w-2.5 h-2.5 rounded-full ${COR[st].ponto}`} />
                    <span className="font-medium text-ink font-mono text-sm">{t.nome}</span>
                    <span className="text-xs bg-surface-elev text-ink-muted px-2 py-0.5 rounded">{intervalo(t.intervalo_s)}</span>
                    {t.atrasada && (
                      <span className="text-xs bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300 px-2 py-0.5 rounded">
                        atrasada — última OK {ha(t.idade_ok_s)}
                      </span>
                    )}
                    {!t.atrasada && t.ultimo_status === 'erro' && (
                      <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 px-2 py-0.5 rounded">
                        última execução com erro
                      </span>
                    )}
                    {t.ultimo_status === 'rodando' && (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 px-2 py-0.5 rounded">
                        rodando agora
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                    <div>
                      <p className="text-[11px] text-ink-subtle">Última execução</p>
                      <p className="text-ink tabular-nums">{fmtHora(t.ultima_em)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-ink-subtle">Última OK</p>
                      <p className="text-ink">{ha(t.idade_ok_s)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-ink-subtle">Duração</p>
                      <p className="text-ink tabular-nums">{t.duracao_ms === null ? '—' : `${t.duracao_ms} ms`}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-ink-subtle">Últimas 24 h</p>
                      <p className="text-ink tabular-nums">
                        {t.execucoes_24h} execuções
                        {t.erros_24h > 0 && <span className="text-red-600 dark:text-red-400"> · {t.erros_24h} com erro</span>}
                      </p>
                    </div>
                  </div>
                  {t.erro && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-mono break-words">{t.erro}</p>
                  )}
                  {!t.erro && t.resultado != null && (
                    <p className="mt-2 text-xs text-ink-subtle break-words">{resumoResultado(t.resultado)}</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Erros no web e no coletor */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em]">
              Erros no web e no coletor
            </h2>
            <div className="flex gap-1">
              {[24, 72, 168].map((h) => (
                <button
                  key={h}
                  onClick={() => setHorasErros(h)}
                  className={`text-xs px-2.5 py-1.5 rounded-lg min-h-[32px] border transition-colors ${
                    horasErros === h
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                      : 'border-surface-border text-ink-muted hover:bg-surface-elev'
                  }`}
                >
                  {h === 24 ? '24 h' : `${h / 24} d`}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-8">
            {erros.length === 0 ? (
              <p className="text-sm text-ink-subtle">Nenhum erro relatado pelo web ou pelo coletor no período.</p>
            ) : (
              <div className="space-y-2">
                {erros.map((e) => (
                  <details key={e.id} className="bg-surface-card rounded-xl border border-surface-border px-4 py-3 group">
                    <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-3 gap-y-1 min-h-[28px]">
                      <span className="text-xs text-ink-subtle tabular-nums">{fmtHora(e.criado_em)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        e.origem === 'mobile'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                      }`}>
                        {e.origem === 'mobile' ? `coletor ${e.versao}` : 'web'}
                      </span>
                      {e.usuario && <span className="text-xs text-ink-muted">{e.usuario}</span>}
                      {e.tela && <span className="text-xs font-mono text-ink-subtle truncate max-w-[40%]">{e.tela}</span>}
                      <span className="text-sm text-ink basis-full sm:basis-auto sm:flex-1 truncate group-open:whitespace-normal">{e.mensagem}</span>
                    </summary>
                    <div className="mt-2 text-xs text-ink-subtle">{e.dispositivo}</div>
                    {e.stack && (
                      <pre className="mt-2 text-[11px] font-mono text-ink-muted whitespace-pre-wrap break-words max-h-64 overflow-auto bg-surface-elev rounded-lg p-2">{e.stack}</pre>
                    )}
                    {e.extra && (
                      <pre className="mt-2 text-[11px] font-mono text-ink-subtle whitespace-pre-wrap break-words max-h-40 overflow-auto">{JSON.stringify(e.extra, null, 1)}</pre>
                    )}
                  </details>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-ink-subtle">
            Histórico completo das execuções (últimos {dados.retencao_dias} dias) no{' '}
            <a href="/django-admin/core/execucaotarefa/" className="underline underline-offset-2 hover:text-ink transition-colors" target="_blank" rel="noreferrer">
              Django admin
            </a>
            {' '}e os erros de cliente (30 dias) em{' '}
            <a href="/django-admin/core/errocliente/" className="underline underline-offset-2 hover:text-ink transition-colors" target="_blank" rel="noreferrer">
              Erros de cliente
            </a>
            . Logs em JSON saem no <code className="font-mono">docker logs</code> de cada serviço.
          </p>
        </>
      )}
    </div>
  )
}
