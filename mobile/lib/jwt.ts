/**
 * Decode simples de JWT (só lê o payload — sem validar assinatura).
 * Suficiente pra extrair user_id, username e perfil do token.
 *
 * Em RN o `atob` global existe (Hermes), mas pra garantir compatibilidade
 * mais ampla incluí o fallback abaixo.
 */
function base64UrlDecode(str: string): string {
  // base64url → base64 padrão
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  // Padding
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const decoded = typeof atob === 'function'
    ? atob(b64 + pad)
    : Buffer.from(b64 + pad, 'base64').toString('binary')
  // UTF-8 decode
  return decodeURIComponent(
    decoded
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  )
}

export function parseJwt<T = Record<string, unknown>>(token: string): T {
  const [, payload] = token.split('.')
  return JSON.parse(base64UrlDecode(payload)) as T
}
