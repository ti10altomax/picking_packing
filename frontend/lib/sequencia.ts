/** "Sequência 12 · Aba 3" quando o Pátio deu um nome, senão "Sequência 12" (2026-11-17).
 * `curto` usa "Seq." para caber em badge/coluna. */
export function rotuloSequencia(
  s: { numero: number; descricao?: string | null } | null | undefined,
  curto = false,
): string {
  if (!s) return ''
  const base = `${curto ? 'Seq.' : 'Sequência'} ${s.numero}`
  return s.descricao ? `${base} · ${s.descricao}` : base
}
