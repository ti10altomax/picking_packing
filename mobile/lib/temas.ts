import { vars } from 'nativewind'

// Tokens em runtime — NativeWind aplica via style={...} numa View raiz.
// Mesmos valores do global.css; mantemos os dois para o web ler também.
export const temaLight = vars({
  '--surface-bg': '249 250 251',
  '--surface-card': '255 255 255',
  '--surface-elev': '244 244 245',
  '--surface-border': '228 228 231',
  '--ink-default': '24 24 27',
  '--ink-muted': '82 82 91',
  '--ink-subtle': '161 161 170',
})

export const temaDark = vars({
  '--surface-bg': '9 9 11',
  '--surface-card': '24 24 27',
  '--surface-elev': '39 39 42',
  '--surface-border': '63 63 70',
  '--ink-default': '244 244 245',
  '--ink-muted': '161 161 170',
  '--ink-subtle': '113 113 122',
})
