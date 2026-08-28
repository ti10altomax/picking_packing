import { vars } from 'nativewind'

// Tokens em runtime — NativeWind aplica via style={...} numa View raiz.
// Neutros QUENTES (stone/creme), paridade com o global.css do web.
export const temaLight = vars({
  '--surface-bg': '250 249 245',     // creme
  '--surface-card': '255 255 255',
  '--surface-elev': '245 245 244',   // stone-100
  '--surface-border': '231 229 228', // stone-200
  '--ink-default': '28 25 23',       // stone-900
  '--ink-muted': '87 83 78',         // stone-600
  '--ink-subtle': '168 162 158',     // stone-400
})

export const temaDark = vars({
  '--surface-bg': '12 10 9',         // stone-950
  '--surface-card': '28 25 23',      // stone-900
  '--surface-elev': '41 37 36',      // stone-800
  '--surface-border': '68 64 60',    // stone-700 (borda um pouco mais visível no RN)
  '--ink-default': '245 245 244',    // stone-100
  '--ink-muted': '168 162 158',      // stone-400
  '--ink-subtle': '120 113 108',     // stone-500
})
