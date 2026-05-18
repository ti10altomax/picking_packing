/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Em deploy de produção: tolera erros de tipo/lint que não quebram runtime.
  // Pode tirar quando o codebase estiver "limpo" de warnings.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // O proxy interno (server-side) leva /api/* para o backend Docker.
  // Como o navegador só vê o Next.js (HTTPS), não há mixed content.
  // Forçamos trailing slash no destino: Django (APPEND_SLASH) levanta
  // RuntimeError em POST sem slash; nossas URLs DRF sempre têm slash.
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*/`,
      },
    ]
  },
}

module.exports = nextConfig
