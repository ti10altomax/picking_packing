'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { ajudaPorRota } from '@/content/ajuda'
import { PERFIL_LABEL, type AjudaTela } from '@/content/ajuda/tipos'

/**
 * Botão "?" do cabeçalho (manual embutido, 2026-10-29).
 *
 * Descobre a tela pela rota atual (`content/ajuda/index.ts`) e abre um painel
 * lateral com a ajuda daquela tela. Some quando a rota não tem ajuda cadastrada
 * — o script `npm run ajuda:checar` aponta as rotas que ficaram sem.
 */
export function AjudaBotao() {
  const pathname = usePathname()
  const tela = ajudaPorRota(pathname)
  const [aberto, setAberto] = useState(false)

  // Fecha ao navegar
  useEffect(() => { setAberto(false) }, [pathname])

  if (!tela) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={`Ajuda: ${tela.titulo}`}
        title="Ajuda desta tela"
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-elev hover:text-ink transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      {aberto && <AjudaPainel tela={tela} onFechar={() => setAberto(false)} />}
    </>
  )
}

function AjudaPainel({ tela, onFechar }: { tela: AjudaTela; onFechar: () => void }) {
  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', esc)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', esc)
      document.body.style.overflow = overflow
    }
  }, [onFechar])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ajuda-titulo">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <aside className="relative h-full w-full sm:w-[440px] md:w-[520px] bg-surface-card border-l border-surface-border shadow-2xl flex flex-col">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-border">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-ink-subtle">Ajuda{tela.menu ? ` · ${tela.menu}` : ''}</p>
            <h2 id="ajuda-titulo" className="text-xl text-ink leading-tight">{tela.titulo}</h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar ajuda"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-muted hover:bg-surface-elev hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AjudaConteudo tela={tela} compacto />
        </div>
        <footer className="px-5 py-3 border-t border-surface-border text-sm flex items-center justify-between">
          <a href={`/ajuda#${tela.chave}`} target="_blank" rel="noopener" className="text-ink-muted hover:text-ink underline underline-offset-2">
            Abrir manual completo
          </a>
          <span className="text-ink-subtle">Esc fecha</span>
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

/**
 * Corpo da ajuda — usado no painel lateral e na página /ajuda.
 * `compacto` esconde perfis e capturas grandes (no painel a tela já está atrás).
 */
export function AjudaConteudo({ tela, compacto = false }: { tela: AjudaTela; compacto?: boolean }) {
  return (
    <div className="space-y-6 text-[15px] leading-relaxed text-ink">
      {!compacto && (
        <p className="text-sm text-ink-muted">
          {tela.perfis.map((p) => PERFIL_LABEL[p]).join(' · ')}
          {tela.menu ? <> · <span className="text-ink">{tela.menu}</span></> : null}
        </p>
      )}

      <p>{tela.resumo}</p>

      {tela.capturas && tela.capturas.length > 0 && (
        <div className={compacto ? 'space-y-3' : 'grid gap-4 sm:grid-cols-2'}>
          {tela.capturas.map((c) => (
            <figure key={c.src} className={c.mobile ? 'max-w-[300px]' : ''}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.src}
                alt={c.legenda || tela.titulo}
                loading="lazy"
                className="rounded-xl border border-surface-border shadow-sm w-full"
              />
              {c.legenda && <figcaption className="mt-1.5 text-sm text-ink-muted">{c.legenda}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {tela.passos && tela.passos.length > 0 && (
        <Secao titulo="Passo a passo">
          <ol className="list-decimal pl-5 space-y-1.5 marker:text-ink-subtle marker:font-semibold">
            {tela.passos.map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        </Secao>
      )}

      {tela.elementos && tela.elementos.length > 0 && (
        <Secao titulo="O que há na tela">
          <dl className="space-y-2">
            {tela.elementos.map((e) => (
              <div key={e.nome} className="grid grid-cols-[minmax(110px,32%)_1fr] gap-x-3 gap-y-0.5">
                <dt className="font-semibold text-ink">{e.nome}</dt>
                <dd className="text-ink-muted">{e.descricao}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      )}

      {tela.situacoes && tela.situacoes.length > 0 && (
        <Secao titulo="Quando aparecer…">
          <ul className="space-y-2.5">
            {tela.situacoes.map((s, i) => (
              <li key={i} className="rounded-lg border border-surface-border bg-surface-elev/60 px-3 py-2">
                <p className="font-semibold text-ink">{s.quando}</p>
                <p className="text-ink-muted">{s.oQueFazer}</p>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {tela.dicas && tela.dicas.length > 0 && (
        <Secao titulo="Dicas">
          <ul className="list-disc pl-5 space-y-1 marker:text-ink-subtle">
            {tela.dicas.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </Secao>
      )}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">{titulo}</h3>
      {children}
    </section>
  )
}
