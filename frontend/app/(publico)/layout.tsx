import { Suspense } from 'react'

// Rotas públicas (sem login): /ajuda — manual do usuário.
// Suspense por causa do useSearchParams na página (exigência do App Router).
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
