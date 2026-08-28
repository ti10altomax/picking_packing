/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // Paleta de status (mantida para legados)
        status: {
          pendente: '#F97316',
          separada: '#EAB308',
          faturado: '#3B82F6',
          aguardando: '#6B7280',
          concluido: '#22C55E',
        },
        // Surface tokens — funcionam em light e dark via CSS vars
        surface: {
          bg: 'rgb(var(--surface-bg) / <alpha-value>)',
          card: 'rgb(var(--surface-card) / <alpha-value>)',
          elev: 'rgb(var(--surface-elev) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink-default) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--ink-subtle) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
