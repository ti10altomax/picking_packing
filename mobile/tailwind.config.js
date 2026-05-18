/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Tokens via CSS vars — light e dark trocam o valor das vars
        // (paridade com o frontend web)
        surface: {
          bg:     'rgb(var(--surface-bg) / <alpha-value>)',
          card:   'rgb(var(--surface-card) / <alpha-value>)',
          elev:   'rgb(var(--surface-elev) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink-default) / <alpha-value>)',
          muted:   'rgb(var(--ink-muted) / <alpha-value>)',
          subtle:  'rgb(var(--ink-subtle) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
