'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { destinoPorPerfil } from '@/lib/destino'

function parseJwt(token: string) {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  )
  return JSON.parse(json)
}

export default function LoginPage() {
  const router = useRouter()
  const setAuth = useAuthStore((s) => s.setAuth)
  const hydrate = useAuthStore((s) => s.hydrate)
  const [form, setForm] = useState({ username: '', password: '' })
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [verificandoSessao, setVerificandoSessao] = useState(true)

  // Se já tem sessão válida, redireciona pro perfil sem mostrar o form
  useEffect(() => {
    hydrate()
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null
    if (token && raw) {
      try {
        const user = JSON.parse(raw)
        router.replace(destinoPorPerfil(user.perfil))
        return
      } catch { /* segue pro form */ }
    }
    setVerificandoSessao(false)
  }, [hydrate, router])

  if (verificandoSessao) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const data = await authApi.login(form.username, form.password)
      const payload = parseJwt(data.access)
      setAuth(data.access, data.refresh, {
        id: payload.user_id,
        username: payload.username ?? form.username,
        perfil: payload.perfil ?? 'conferente',
      })
      const destino = destinoPorPerfil(payload.perfil)
      router.push(destino)
    } catch {
      setErro('Usuário ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-black bg-no-repeat bg-center bg-cover"
      style={{ backgroundImage: 'url(/wallpaper.svg)' }}
    >
      {/* Formulário "vidro fosco" — translúcido pra deixar a marca aparecer atrás */}
      <div className="relative w-full max-w-sm bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-white/20 dark:border-white/10 shadow-2xl shadow-black/40 overflow-hidden">
        {/* Cabeçalho com logo da Altomax */}
        <img
          src="/wallpaperaltomax.svg"
          alt="Altomax"
          className="w-full h-auto block"
        />

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Usuário</label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                required
                className="input-glass w-full h-12 px-4 bg-white/5 border border-white/20 rounded-xl text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/10 focus:border-white/40 transition-all"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Senha</label>
              <input
                type="password"
                autoComplete="current-password"
                required
                className="input-glass w-full h-12 px-4 bg-white/5 border border-white/20 rounded-xl text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40 focus:bg-white/10 focus:border-white/40 transition-all"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            {erro && (
              <p className="text-red-200 text-sm bg-red-500/20 border border-red-400/40 rounded-lg px-3 py-2 backdrop-blur-sm">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-white hover:bg-white/90 text-black rounded-xl font-semibold text-base disabled:opacity-50 active:scale-[0.98] transition-all shadow-lg shadow-black/30"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
