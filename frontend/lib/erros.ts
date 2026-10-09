import axios from 'axios'

/**
 * Relato de erros do web para o backend (observabilidade, 2026-10-08).
 *
 * `POST /api/erros-cliente/` — vai parar em Admin → Saúde e no Django admin.
 * Usa axios cru (não o `api` de lib/api.ts) para não cair no interceptor de
 * 401 e redirecionar para /login no meio de um relato. Sem token também
 * funciona (tela de login). Dedup: a mesma mensagem só sobe uma vez por
 * minuto, para um loop de render não virar centenas de linhas.
 */

type Relato = {
  mensagem: string
  stack?: string | null
  tela?: string
  extra?: Record<string, unknown>
}

const recentes = new Map<string, number>()
const JANELA_DEDUP_MS = 60_000

// Ruído conhecido do navegador que não é bug nosso
const IGNORAR = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Loading chunk .* failed/i, // deploy no meio da sessão — o reload resolve
]

export function reportarErro(r: Relato): void {
  try {
    if (typeof window === 'undefined') return
    const mensagem = (r.mensagem || '(sem mensagem)').slice(0, 500)
    if (IGNORAR.some((re) => re.test(mensagem))) return

    const chave = mensagem.slice(0, 200)
    const agora = Date.now()
    const ultimo = recentes.get(chave)
    if (ultimo && agora - ultimo < JANELA_DEDUP_MS) return
    recentes.set(chave, agora)

    let token: string | null = null
    try { token = localStorage.getItem('access_token') } catch { /* privado / bloqueado */ }

    axios.post(
      '/api/erros-cliente/',
      {
        origem: 'web',
        mensagem,
        stack: (r.stack || '').slice(0, 8000),
        tela: r.tela ?? window.location.pathname,
        versao: 'web',
        dispositivo: navigator.userAgent.slice(0, 200),
        extra: r.extra,
      },
      { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 5000 },
    ).catch(() => { /* se o backend caiu, não há para quem contar */ })
  } catch {
    // nunca deixar o relator quebrar a tela
  }
}

/** Resume um erro qualquer (Error, AxiosError, string) num relato. */
export function relatoDe(erro: unknown, extra?: Record<string, unknown>): Relato {
  if (axios.isAxiosError(erro)) {
    const status = erro.response?.status
    const url = erro.config?.url
    return {
      mensagem: `${erro.config?.method?.toUpperCase() ?? ''} ${url ?? ''} → ${status ?? erro.code ?? 'sem resposta'}: ${erro.message}`,
      stack: erro.stack,
      extra: { ...extra, status, url, resposta: erro.response?.data },
    }
  }
  if (erro instanceof Error) {
    return { mensagem: `${erro.name}: ${erro.message}`, stack: erro.stack, extra }
  }
  return { mensagem: String(erro), extra }
}
