import Link from 'next/link'

/**
 * Marca "ALTOMAX" dos cabeçalhos (2026-10-26, substitui o "Separa" em Fraunces).
 * Fonte Cinzel (capital romana, a alternativa livre à Trajan do logotipo),
 * carregada pelo next/font em `app/layout.tsx` como `--font-marca`.
 * Espaçamento aberto entre letras, como no logotipo.
 */
export function Marca({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Altomax — início"
      className="font-marca font-semibold text-[17px] leading-none tracking-[0.2em] pl-[0.2em] hover:opacity-70 transition-opacity"
    >
      ALTOMAX
    </Link>
  )
}
