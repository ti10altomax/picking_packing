import type { Metadata, Viewport } from 'next'
import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeToggle'
import { DialogProvider } from '@/components/Dialog'

// Tipografia do sistema (self-hosted pelo next/font — zero CDN em runtime):
// Fraunces = serifa de display (títulos, marca); Manrope = UI; JetBrains Mono = códigos/EAN
const manrope = Manrope({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
  axes: ['opsz'],
})
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'Separa — Altomax',
  description: 'Sistema de separação interna',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Separa',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

// Script inline aplicado antes do React hydratar — evita flash de tela branca
const noFlashScript = `
(function() {
  try {
    var saved = localStorage.getItem('theme') || 'system';
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var eff = saved === 'system' ? sys : saved;
    if (eff === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${manrope.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="bg-surface-bg text-ink antialiased" suppressHydrationWarning>
        <ThemeProvider />
        <DialogProvider>
          {children}
        </DialogProvider>
      </body>
    </html>
  )
}
