/**
 * Code 128 (auto B/C) em SVG — para o código de barras do número do pedido na
 * etiqueta de volume impressa pelo navegador. A Zebra faz isso nativa (^BC);
 * aqui é só para o caminho HTML ficar equivalente.
 */

// Larguras (barra/espaço alternados) dos 107 símbolos do Code 128
const PADROES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const START_C = 105
const CODE_C = 99
const STOP = 106

/** Sequência de valores Code 128 (com start, checksum e stop) para o texto. */
function codificar(texto: string): number[] {
  const s = texto.replace(/[^\x20-\x7e]/g, '')
  if (!s) return []
  const valores: number[] = []
  const soDigitos = /^\d+$/.test(s)

  if (soDigitos && s.length >= 2) {
    let i = 0
    if (s.length % 2 === 1) {
      // Dígito ímpar na frente em Code B, depois troca para C
      valores.push(START_B, s.charCodeAt(0) - 32, CODE_C)
      i = 1
    } else {
      valores.push(START_C)
    }
    for (; i < s.length; i += 2) valores.push(Number(s.slice(i, i + 2)))
  } else {
    valores.push(START_B)
    for (const ch of s) valores.push(ch.charCodeAt(0) - 32)
  }

  let soma = valores[0]
  for (let i = 1; i < valores.length; i++) soma += valores[i] * i
  valores.push(soma % 103, STOP)
  return valores
}

export type Barras = { larguras: number[]; total: number }

/** Larguras em módulos (barra, espaço, barra, …) e a largura total. */
export function barrasCode128(texto: string): Barras {
  const larguras: number[] = []
  for (const v of codificar(texto)) {
    for (const d of PADROES[v]) larguras.push(Number(d))
  }
  return { larguras, total: larguras.reduce((a, b) => a + b, 0) }
}

/** SVG pronto (string) com altura e largura em qualquer unidade CSS. */
export function svgCode128(texto: string, alturaCss: string, larguraMaxCss: string): string {
  const { larguras, total } = barrasCode128(texto)
  if (!total) return ''
  let x = 0
  const rects: string[] = []
  larguras.forEach((w, i) => {
    if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="100" />`)
    x += w
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" preserveAspectRatio="none" ` +
    `style="height:${alturaCss};width:${larguraMaxCss};display:block" shape-rendering="crispEdges" fill="#000">` +
    rects.join('') +
    '</svg>'
  )
}
