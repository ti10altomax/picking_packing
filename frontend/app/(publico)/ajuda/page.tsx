'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { TELAS, telasDoPerfil } from '@/content/ajuda'
import { PERFIL_LABEL, type AjudaTela, type PerfilAjuda } from '@/content/ajuda/tipos'
import { AjudaConteudo } from '@/components/Ajuda'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Marca } from '@/components/Marca'

/**
 * Manual do usuário (2026-10-29) — página pública, sem login.
 *
 * Junta a ajuda de todas as telas (`content/ajuda`) num documento navegável
 * por perfil. O "?" de cada tela abre aqui em `#chave`; o coletor abre esta
 * página no navegador do aparelho. Imprimível (Ctrl+P) — a navegação some.
 */

const PERFIS: PerfilAjuda[] = ['conferente', 'supervisor_vendas', 'supervisor_patio', 'admin']

export default function AjudaPage() {
  const params = useSearchParams()
  const perfilParam = params.get('perfil') as PerfilAjuda | null
  const [perfil, setPerfil] = useState<PerfilAjuda | 'todos'>(
    perfilParam && PERFIS.includes(perfilParam) ? perfilParam : 'todos',
  )
  const [menuAberto, setMenuAberto] = useState(false)

  const telas = useMemo(
    () => (perfil === 'todos' ? TELAS : telasDoPerfil(perfil)),
    [perfil],
  )

  // Rola até a âncora depois de renderizar (o hash chega antes das seções existirem)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    const alvo = document.getElementById(hash)
    if (alvo) alvo.scrollIntoView({ block: 'start' })
  }, [telas])

  return (
    <div className="min-h-screen bg-surface-bg text-ink">
      <header className="bg-surface-card border-b border-surface-border px-4 h-14 flex items-center justify-between sticky top-0 z-10 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Marca href="/ajuda" />
          <span className="text-ink-subtle">·</span>
          <span className="text-ink-muted truncate">Manual do usuário</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            className="md:hidden text-sm min-h-[44px] px-3 rounded-lg text-ink-muted hover:bg-surface-elev"
          >
            Índice
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Índice lateral */}
        <nav
          className={`print:hidden ${menuAberto ? 'block' : 'hidden'} md:block fixed md:sticky top-14 left-0 z-10 h-[calc(100vh-3.5rem)] w-72 shrink-0 overflow-y-auto bg-surface-card md:bg-transparent border-r border-surface-border px-4 py-4`}
        >
          <label className="block text-xs uppercase tracking-wide text-ink-subtle mb-1">Perfil</label>
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as PerfilAjuda | 'todos')}
            className="w-full mb-4 rounded-lg border border-surface-border bg-surface-card px-2 py-2 text-sm text-ink"
          >
            <option value="todos">Todos os perfis</option>
            {PERFIS.map((p) => <option key={p} value={p}>{PERFIL_LABEL[p]}</option>)}
          </select>
          <ol className="space-y-0.5">
            {telas.map((t) => (
              <li key={t.chave}>
                <a
                  href={`#${t.chave}`}
                  onClick={() => setMenuAberto(false)}
                  className="block rounded-md px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-elev hover:text-ink"
                >
                  {t.titulo}
                  {t.menu && <span className="block text-xs text-ink-subtle">{t.menu}</span>}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Conteúdo */}
        <main className="flex-1 min-w-0 px-4 sm:px-8 py-6 max-w-4xl">
          <div className="mb-10">
            <h1 className="text-3xl sm:text-4xl text-ink">Manual do usuário</h1>
            <p className="mt-2 text-ink-muted">
              Sistema de separação interna da Altomax. Cada seção corresponde a uma tela;
              o botão <strong className="text-ink">?</strong> no cabeçalho de qualquer tela abre a mesma ajuda ali.
              {perfil !== 'todos' && <> Mostrando as telas do perfil <strong className="text-ink">{PERFIL_LABEL[perfil]}</strong>.</>}
            </p>
          </div>

          <div className="space-y-14">
            {telas.map((t) => <SecaoTela key={t.chave} tela={t} />)}
          </div>

          <footer className="mt-16 pt-6 border-t border-surface-border text-sm text-ink-subtle print:hidden">
            Faltou algo? Avise a TI — o manual vive junto com o sistema e é atualizado a cada tela nova.
          </footer>
        </main>
      </div>
    </div>
  )
}

function SecaoTela({ tela }: { tela: AjudaTela }) {
  return (
    <article id={tela.chave} className="scroll-mt-20 break-inside-avoid">
      <header className="mb-4">
        {tela.menu && <p className="text-xs uppercase tracking-wide text-ink-subtle">{tela.menu}</p>}
        <h2 className="text-2xl text-ink">{tela.titulo}</h2>
      </header>
      <AjudaConteudo tela={tela} />
      {tela.relacionadas && tela.relacionadas.length > 0 && (
        <p className="mt-5 text-sm text-ink-muted print:hidden">
          Veja também:{' '}
          {tela.relacionadas.map((c, i) => {
            const alvo = TELAS.find((x) => x.chave === c)
            if (!alvo) return null
            return (
              <span key={c}>
                {i > 0 && ' · '}
                <a href={`#${c}`} className="underline underline-offset-2 hover:text-ink">{alvo.titulo}</a>
              </span>
            )
          })}
        </p>
      )}
    </article>
  )
}
