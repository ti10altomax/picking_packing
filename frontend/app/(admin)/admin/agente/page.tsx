'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { agenteApi, type AgenteRegistrado, type VersaoAgente } from '@/lib/api'
import { useDialog } from '@/components/Dialog'
import { useToast } from '@/components/Toast'

/**
 * Admin → Agente de impressão (apps/impressao/distribuicao.py, 2026-11-12).
 *
 * Mesmo desenho de Admin → App do coletor: o admin publica o SeparaAgente.exe aqui, o
 * backend serve a página pública /agente/ (botões Baixar + passo a passo) para abrir no
 * navegador do PC da Zebra, e o agente.ini sai gerado com a URL deste servidor. A lista
 * de baixo mostra os PCs registrados e a versão que cada um manda no heartbeat.
 */

const INPUT = 'w-full bg-surface-card border border-surface-border text-ink rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300'
const LABEL = 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1'

function mb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// "SeparaAgente-1.0.0.exe" → "1.0.0" (só para pré-preencher o campo)
function versaoDoNome(nome: string): string {
  const m = nome.match(/(\d+\.\d+\.\d+)/)
  return m ? m[1] : ''
}

export default function AgenteImpressaoPage() {
  const dialog = useDialog()
  const toast = useToast()
  const [atual, setAtual] = useState<VersaoAgente | null>(null)
  const [versoes, setVersoes] = useState<VersaoAgente[]>([])
  const [agentes, setAgentes] = useState<AgenteRegistrado[]>([])
  const [ini, setIni] = useState('')
  const [pagina, setPagina] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [mostrarIni, setMostrarIni] = useState(false)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [versao, setVersao] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const inputArquivo = useRef<HTMLInputElement | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await agenteApi.listar()
      setAtual(r.atual)
      setVersoes(r.versoes)
      setAgentes(r.agentes)
      setIni(r.ini)
      setPagina(r.pagina)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function escolherArquivo(f: File | null) {
    setArquivo(f)
    setErro('')
    if (f && !versao) setVersao(versaoDoNome(f.name))
  }

  async function publicar() {
    if (!arquivo) { setErro('Escolha o SeparaAgente.exe.'); return }
    setEnviando(true)
    setErro('')
    try {
      const form = new FormData()
      form.append('arquivo', arquivo)
      form.append('versao', versao.trim())
      form.append('notas', notas)
      await agenteApi.publicar(form)
      setArquivo(null); setVersao(''); setNotas('')
      if (inputArquivo.current) inputArquivo.current.value = ''
      toast.ok('Agente publicado', { detalhe: 'Abra o link /agente/ no PC da impressora para baixar.' })
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg || 'Não foi possível publicar. Veja o arquivo e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  async function apagar(v: VersaoAgente) {
    const ok = await dialog.confirm({
      title: `Apagar a versão ${v.versao}?`,
      message: 'O arquivo some do servidor. Os PCs que já instalaram continuam como estão.',
      variant: 'danger', confirmText: 'Apagar',
    })
    if (!ok) return
    await agenteApi.apagar(v.id)
    await carregar()
  }

  async function copiar(texto: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(texto)
      toast.ok(`${oQue} copiado`)
    } catch {
      toast.aviso('Não deu para copiar', { detalhe: 'Selecione o texto na tela e copie.' })
    }
  }

  const desatualizados = agentes.filter((a) => a.desatualizado).length

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Agente de impressão USB</h1>
        <p className="text-sm text-ink-muted">
          Publique o SeparaAgente.exe aqui. No PC da Zebra, abra o link abaixo no navegador, baixe o programa e o
          agente.ini (já com o endereço deste servidor) e siga o passo a passo da página.
        </p>
      </div>

      {/* Versão atual + link */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Versão atual</h2>
        {carregando && !atual ? (
          <p className="text-sm text-ink-subtle italic">Carregando…</p>
        ) : !atual ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 p-4 text-sm">
            Nenhuma versão publicada ainda. Gere o executável com <code>agente/build.ps1</code> e suba o <code>dist\SeparaAgente.exe</code> abaixo.
          </div>
        ) : (
          <div className="rounded-2xl border border-surface-border bg-surface-card p-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-3xl font-semibold text-ink">SeparaAgente {atual.versao}</span>
              <span className="text-sm text-ink-muted">{mb(atual.tamanho_bytes)} · publicada {fmt(atual.criado_em)}{atual.criado_por ? ` por ${atual.criado_por}` : ''}</span>
            </div>
            {atual.notas && <pre className="mt-3 text-sm text-ink whitespace-pre-wrap font-sans">{atual.notas}</pre>}
            <div className="mt-4 rounded-xl bg-surface-elev border border-surface-border p-4">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Link para abrir no navegador do PC da impressora</p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="text-lg font-mono text-ink break-all">{atual.pagina}</code>
                <button onClick={() => copiar(atual.pagina, 'Link')} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">Copiar</button>
                <a href={atual.pagina} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2 inline-flex items-center">Abrir</a>
              </div>
              <p className="text-xs text-ink-subtle mt-2">
                A página tem os dois botões (programa e agente.ini) e a sequência de comandos: impressoras → registrar → teste → instalar → iniciar.
                Downloads diretos: <a href={atual.url} className="underline">{atual.nome_arquivo}</a> · <a href={atual.ini_url} className="underline">agente.ini</a>
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Publicar */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Publicar nova versão</h2>
        <div className="rounded-2xl border border-surface-border bg-surface-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={LABEL}>Arquivo SeparaAgente.exe</label>
            <input
              ref={inputArquivo}
              type="file"
              accept=".exe,application/vnd.microsoft.portable-executable,application/x-msdownload"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              className={`${INPUT} file:mr-3 file:border-0 file:bg-surface-elev file:text-ink file:rounded-md file:px-3 file:py-1.5`}
            />
            <p className="text-xs text-ink-subtle mt-1">Sai do <code>build.ps1</code> em <code>agente/dist/</code>.{arquivo ? ` Selecionado: ${arquivo.name} (${mb(arquivo.size)})` : ''}</p>
          </div>
          <div>
            <label className={LABEL}>Versão (VERSAO do separa_agente.py)</label>
            <input value={versao} onChange={(e) => setVersao(e.target.value)} placeholder="1.0.0" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>O que mudou (uma linha por item, aparece na página de download)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={INPUT} />
          </div>
          {erro && <p className="sm:col-span-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
          <div className="sm:col-span-2">
            <button
              onClick={publicar}
              disabled={enviando || !arquivo || !versao}
              className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-40"
            >
              {enviando ? 'Enviando…' : 'Publicar'}
            </button>
          </div>
        </div>
      </section>

      {/* PCs com o agente */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">
          Computadores com o agente {agentes.length > 0 && `· ${agentes.length}`}
          {desatualizados > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400 normal-case tracking-normal">{desatualizados} desatualizado{desatualizados > 1 ? 's' : ''}</span>}
        </h2>
        {agentes.length === 0 ? (
          <p className="text-sm text-ink-subtle italic">Nenhum PC se registrou ainda — rode <code>SeparaAgente.exe registrar</code> no computador da impressora.</p>
        ) : (
          <div className="rounded-2xl border border-surface-border bg-surface-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-surface-border">
                  <th className="px-4 py-2.5">Computador</th>
                  <th className="px-4 py-2.5">Versão</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Último sinal</th>
                </tr>
              </thead>
              <tbody>
                {agentes.map((a) => (
                  <tr key={a.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2.5 text-ink font-medium">{a.hostname}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono ${a.desatualizado ? 'text-amber-700 dark:text-amber-300' : 'text-ink'}`}>{a.versao || '—'}</span>
                      {a.desatualizado && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">desatualizado</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${a.online ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300'}`}>
                        {a.online ? 'online' : a.ultimo_heartbeat ? 'offline' : 'nunca conectou'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{fmt(a.ultimo_heartbeat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-subtle mt-2">
          O token de cada PC (para o campo Agent ID da impressora) está em <Link href="/admin/agents" className="underline underline-offset-2 hover:text-ink">Print Agents</Link>.
        </p>
      </section>

      {/* agente.ini gerado */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">agente.ini que a página entrega</h2>
        <p className="text-sm text-ink-muted mb-2">
          Gerado na hora com o endereço deste servidor{pagina ? ` (${pagina.replace(/\/agente\/$/, '')})` : ''}. No PC só falta preencher
          <code className="mx-1">nome_windows</code> com o nome da fila da Zebra; o token entra sozinho no <code>registrar</code>.
          <button onClick={() => setMostrarIni((v) => !v)} className="ml-2 text-blue-600 dark:text-blue-400 min-h-[44px] px-1">{mostrarIni ? 'ocultar' : 'ver conteúdo'}</button>
        </p>
        {mostrarIni && (
          <pre className="rounded-2xl border border-surface-border bg-surface-card p-4 text-xs text-ink overflow-x-auto whitespace-pre">{ini}</pre>
        )}
      </section>

      {/* Histórico */}
      {versoes.length > 1 && (
        <section>
          <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Versões anteriores</h2>
          <ul className="rounded-2xl border border-surface-border bg-surface-card divide-y divide-surface-border">
            {versoes.filter((v) => v.id !== atual?.id).map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-ink">{v.versao}</span>
                <span className="text-ink-subtle">{mb(v.tamanho_bytes)} · {fmt(v.criado_em)}</span>
                <a href={v.url} className="text-blue-600 dark:text-blue-400 ml-auto">baixar</a>
                <button onClick={() => apagar(v)} className="text-red-600 dark:text-red-400 min-h-[44px] px-2">apagar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {atual && versoes.length === 1 && (
        <p className="text-xs text-ink-subtle">
          Publicou errado? <button onClick={() => apagar(atual)} className="underline underline-offset-2 hover:text-ink">apagar a {atual.versao}</button>
        </p>
      )}
    </div>
  )
}
