'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { appApi, type DispositivoApp, type VersaoApp } from '@/lib/api'
import { useDialog } from '@/components/Dialog'

/**
 * Admin → App do coletor (apps/app_mobile, 2026-10-28).
 *
 * 1) Publicar o APK: arquivo + versão + versionCode (+ notas, obrigatória). O backend
 *    valida que é um APK e o serve em /apk/separa-X.Y.Z.apk.
 * 2) Link de download: http://IP:8003/apk/ — é o que se digita no navegador do coletor
 *    (primeira instalação; depois o próprio app avisa quando há versão nova).
 * 3) Inventário: quem está em qual versão (o app manda X-App-Versao em toda requisição).
 */

const INPUT = 'w-full bg-surface-card border border-surface-border text-ink rounded-lg px-3 py-2 text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-300'
const LABEL = 'block text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1'
const PERFIL_LABEL: Record<string, string> = {
  conferente: 'Conferente', supervisor_vendas: 'Sup. Vendas', supervisor_patio: 'Sup. Pátio', admin: 'Admin', etiquetador: 'Etiquetador',
}

function mb(n: number) {
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// "separa-0.9.0.apk" → "0.9.0" (só para pré-preencher o campo)
function versaoDoNome(nome: string): string {
  const m = nome.match(/(\d+\.\d+\.\d+)/)
  return m ? m[1] : ''
}

export default function AppColetorPage() {
  const dialog = useDialog()
  const [atual, setAtual] = useState<VersaoApp | null>(null)
  const [versoes, setVersoes] = useState<VersaoApp[]>([])
  const [dispositivos, setDispositivos] = useState<DispositivoApp[]>([])
  const [carregando, setCarregando] = useState(true)

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [versao, setVersao] = useState('')
  const [versionCode, setVersionCode] = useState('')
  const [notas, setNotas] = useState('')
  const [obrigatoria, setObrigatoria] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(false)
  const inputArquivo = useRef<HTMLInputElement | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await appApi.listar()
      setAtual(r.atual)
      setVersoes(r.versoes)
      setDispositivos(r.dispositivos)
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
    if (!arquivo) { setErro('Escolha o arquivo .apk.'); return }
    setEnviando(true)
    setErro('')
    try {
      const form = new FormData()
      form.append('arquivo', arquivo)
      form.append('versao', versao.trim())
      form.append('version_code', versionCode.trim())
      form.append('notas', notas)
      form.append('obrigatoria', obrigatoria ? 'true' : 'false')
      await appApi.publicar(form)
      setArquivo(null); setVersao(''); setVersionCode(''); setNotas(''); setObrigatoria(false)
      if (inputArquivo.current) inputArquivo.current.value = ''
      await carregar()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { erro?: string } } })?.response?.data?.erro
      setErro(msg || 'Não foi possível publicar. Veja o tamanho do arquivo e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  async function apagar(v: VersaoApp) {
    const ok = await dialog.confirm({
      title: `Apagar a versão ${v.versao}?`,
      message: 'O arquivo some do servidor. Os coletores que já instalaram continuam como estão.',
      variant: 'danger', confirmText: 'Apagar',
    })
    if (!ok) return
    await appApi.apagar(v.id)
    await carregar()
  }

  async function copiarLink() {
    if (!atual) return
    try {
      await navigator.clipboard.writeText(atual.pagina)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem clipboard (http sem contexto seguro): o link está visível na tela */ }
  }

  const desatualizados = dispositivos.filter((d) => d.desatualizado).length

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">App do coletor</h1>
        <p className="text-sm text-ink-muted">Publique o APK aqui; o aparelho baixa pelo navegador e o app avisa quando há versão nova.</p>
      </div>

      {/* Versão atual + link de download */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">Versão atual</h2>
        {carregando && !atual ? (
          <p className="text-sm text-ink-subtle italic">Carregando…</p>
        ) : !atual ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 p-4 text-sm">
            Nenhuma versão publicada ainda. Suba o primeiro APK abaixo.
          </div>
        ) : (
          <div className="rounded-2xl border border-surface-border bg-surface-card p-5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-3xl font-semibold text-ink">Separa {atual.versao}</span>
              <span className="text-sm text-ink-muted">versionCode {atual.version_code} · {mb(atual.tamanho_bytes)} · publicada {fmt(atual.criado_em)}{atual.criado_por ? ` por ${atual.criado_por}` : ''}</span>
              {atual.obrigatoria && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">obrigatória</span>
              )}
            </div>
            {atual.notas && (
              <pre className="mt-3 text-sm text-ink whitespace-pre-wrap font-sans">{atual.notas}</pre>
            )}
            <div className="mt-4 rounded-xl bg-surface-elev border border-surface-border p-4">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Link para abrir no navegador do coletor</p>
              <div className="flex flex-wrap items-center gap-3">
                <code className="text-lg font-mono text-ink break-all">{atual.pagina}</code>
                <button onClick={copiarLink} className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2">
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <a href={atual.pagina} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-2 inline-flex items-center">
                  Abrir
                </a>
              </div>
              <p className="text-xs text-ink-subtle mt-2">
                Na primeira instalação, digite esse endereço no Chrome do aparelho e toque em Baixar. Depois o próprio app mostra o aviso de atualização.
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
            <label className={LABEL}>Arquivo .apk</label>
            <input
              ref={inputArquivo}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              className={`${INPUT} file:mr-3 file:border-0 file:bg-surface-elev file:text-ink file:rounded-md file:px-3 file:py-1.5`}
            />
            <p className="text-xs text-ink-subtle mt-1">Sai do <code>gradlew assembleRelease</code> em <code>mobile/android/app/build/outputs/apk/release/</code>.{arquivo ? ` Selecionado: ${arquivo.name} (${mb(arquivo.size)})` : ''}</p>
          </div>
          <div>
            <label className={LABEL}>Versão (app.json)</label>
            <input value={versao} onChange={(e) => setVersao(e.target.value)} placeholder="0.9.0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>versionCode (build.gradle)</label>
            <input value={versionCode} onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ''))} placeholder="15" inputMode="numeric" className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>O que mudou (uma linha por item, aparece no coletor)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={INPUT} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink min-h-[44px]">
            <input type="checkbox" checked={obrigatoria} onChange={(e) => setObrigatoria(e.target.checked)} className="w-5 h-5" />
            Obrigatória — o app bloqueia até atualizar (senão só mostra um aviso que pode ser fechado)
          </label>
          {erro && <p className="sm:col-span-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
          <div className="sm:col-span-2">
            <button
              onClick={publicar}
              disabled={enviando || !arquivo || !versao || !versionCode}
              className="bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-40"
            >
              {enviando ? 'Enviando…' : 'Publicar'}
            </button>
          </div>
        </div>
      </section>

      {/* Inventário */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-ink-subtle uppercase tracking-[0.16em] mb-3">
          Aparelhos {dispositivos.length > 0 && `· ${dispositivos.length}`}
          {desatualizados > 0 && <span className="ml-2 text-amber-600 dark:text-amber-400 normal-case tracking-normal">{desatualizados} desatualizado{desatualizados > 1 ? 's' : ''}</span>}
        </h2>
        {dispositivos.length === 0 ? (
          <p className="text-sm text-ink-subtle italic">Nenhum aparelho se identificou ainda — só o app a partir da 0.9.0 manda a versão.</p>
        ) : (
          <div className="rounded-2xl border border-surface-border bg-surface-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-surface-border">
                  <th className="px-4 py-2.5">Usuário</th>
                  <th className="px-4 py-2.5">Aparelho</th>
                  <th className="px-4 py-2.5">Versão</th>
                  <th className="px-4 py-2.5">Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {dispositivos.map((d) => (
                  <tr key={d.id} className="border-b border-surface-border last:border-0">
                    <td className="px-4 py-2.5 text-ink">
                      {d.usuario} <span className="text-xs text-ink-subtle">{PERFIL_LABEL[d.perfil] ?? d.perfil}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{d.dispositivo || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-mono ${d.desatualizado ? 'text-amber-700 dark:text-amber-300' : 'text-ink'}`}>{d.versao}</span>
                      {d.desatualizado && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">desatualizado</span>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{fmt(d.ultimo_acesso_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                <span className="text-ink-subtle">code {v.version_code} · {mb(v.tamanho_bytes)} · {fmt(v.criado_em)}</span>
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
